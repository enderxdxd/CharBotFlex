import { db, collections } from '../config/firebase.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';

export interface QueueConfig {
  enabled: boolean;
  maxChatsPerOperator: number;
  distributionStrategy: 'round-robin' | 'least-busy' | 'skill-based';
  priorityEnabled: boolean;
  autoAssignEnabled: boolean;
  waitTimeThreshold: number; // minutos
}

export interface OperatorLoad {
  operatorId: string;
  operatorName: string;
  currentChats: number;
  maxChats: number;
  department: string;
  status: 'online' | 'busy' | 'offline';
  skills?: string[];
}

export class QueueService {
  private lastAssignedIndex = 0; // Para round-robin

  /**
   * Obter configuração da fila
   */
  async getQueueConfig(): Promise<QueueConfig> {
    try {
      const doc = await db.collection('settings').doc('queue_config').get();

      if (!doc.exists) {
        return this.getDefaultConfig();
      }

      return doc.data() as QueueConfig;
    } catch (error) {
      logger.error('Erro ao buscar configuração da fila:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Configuração padrão
   */
  private getDefaultConfig(): QueueConfig {
    return {
      enabled: true,
      maxChatsPerOperator: 5,
      distributionStrategy: 'least-busy',
      priorityEnabled: false,
      autoAssignEnabled: true,
      waitTimeThreshold: 5,
    };
  }

  /**
   * Atualizar configuração
   */
  async updateQueueConfig(config: Partial<QueueConfig>): Promise<QueueConfig> {
    try {
      await db
        .collection('settings')
        .doc('queue_config')
        .set(config, { merge: true });

      logger.info('✅ Configuração da fila atualizada');
      return await this.getQueueConfig();
    } catch (error) {
      logger.error('Erro ao atualizar configuração da fila:', error);
      throw error;
    }
  }

  /**
   * Obter operadores disponíveis
   */
  async getAvailableOperators(department?: string): Promise<OperatorLoad[]> {
    try {
      let query = db
        .collection(collections.users)
        .where('role', 'in', ['operator', 'supervisor', 'admin'])
        .where('status', 'in', ['online', 'available']);

      if (department) {
        query = query.where('department', '==', department);
      }

      const snapshot = await query.get();

      const operators: OperatorLoad[] = [];

      for (const doc of snapshot.docs) {
        const user = doc.data();

        // Contar conversas ativas do operador
        const conversationsSnapshot = await db
          .collection(collections.conversations)
          .where('assignedTo', '==', doc.id)
          .where('status', 'in', ['human', 'waiting'])
          .get();

        const currentChats = conversationsSnapshot.size;
        const maxChats = user.maxChats || 5;

        // Só incluir se não atingiu o limite
        if (currentChats < maxChats) {
          operators.push({
            operatorId: doc.id,
            operatorName: user.name,
            currentChats,
            maxChats,
            department: user.department || 'Geral',
            status: currentChats >= maxChats ? 'busy' : user.status,
            skills: user.skills || [],
          });
        }
      }

      return operators;
    } catch (error) {
      logger.error('Erro ao buscar operadores disponíveis:', error);
      return [];
    }
  }

  /**
   * Selecionar melhor operador baseado na estratégia
   */
  async selectBestOperator(
    department?: string,
    requiredSkills?: string[]
  ): Promise<OperatorLoad | null> {
    try {
      const config = await this.getQueueConfig();
      let operators = await this.getAvailableOperators(department);

      if (operators.length === 0) {
        logger.warn('⚠️ Nenhum operador disponível');
        return null;
      }

      // Filtrar por skills se necessário
      if (requiredSkills && requiredSkills.length > 0) {
        operators = operators.filter((op) =>
          requiredSkills.some((skill) => op.skills?.includes(skill))
        );

        if (operators.length === 0) {
          logger.warn('⚠️ Nenhum operador com as skills necessárias');
          // Fallback: buscar todos operadores
          operators = await this.getAvailableOperators(department);
        }
      }

      // Aplicar estratégia de distribuição
      switch (config.distributionStrategy) {
        case 'round-robin':
          return this.selectRoundRobin(operators);

        case 'least-busy':
          return this.selectLeastBusy(operators);

        case 'skill-based':
          return this.selectBySkill(operators, requiredSkills);

        default:
          return this.selectLeastBusy(operators);
      }
    } catch (error) {
      logger.error('Erro ao selecionar operador:', error);
      return null;
    }
  }

  /**
   * Estratégia Round Robin
   */
  private selectRoundRobin(operators: OperatorLoad[]): OperatorLoad {
    this.lastAssignedIndex = (this.lastAssignedIndex + 1) % operators.length;
    return operators[this.lastAssignedIndex];
  }

  /**
   * Estratégia Least Busy (menos ocupado)
   */
  private selectLeastBusy(operators: OperatorLoad[]): OperatorLoad {
    return operators.reduce((prev, current) =>
      current.currentChats < prev.currentChats ? current : prev
    );
  }

  /**
   * Estratégia baseada em skills
   */
  private selectBySkill(
    operators: OperatorLoad[],
    requiredSkills?: string[]
  ): OperatorLoad {
    if (!requiredSkills || requiredSkills.length === 0) {
      return this.selectLeastBusy(operators);
    }

    // Calcular score de match de skills
    const operatorsWithScore = operators.map((op) => {
      const matchedSkills = requiredSkills.filter((skill) =>
        op.skills?.includes(skill)
      ).length;
      return {
        ...op,
        skillScore: matchedSkills,
      };
    });

    // Ordenar por skill score (maior) e depois por menos ocupado
    operatorsWithScore.sort((a, b) => {
      if (b.skillScore !== a.skillScore) {
        return b.skillScore - a.skillScore;
      }
      return a.currentChats - b.currentChats;
    });

    return operatorsWithScore[0];
  }

  /**
   * Atribuir conversa automaticamente
   */
  async autoAssignConversation(
    conversationId: string,
    department?: string,
    requiredSkills?: string[]
  ): Promise<boolean> {
    try {
      const config = await this.getQueueConfig();

      if (!config.autoAssignEnabled) {
        logger.info('⏸️ Auto-atribuição desabilitada');
        return false;
      }

      const operator = await this.selectBestOperator(department, requiredSkills);

      if (!operator) {
        logger.warn(`⚠️ Nenhum operador disponível para conversa ${conversationId}`);
        
        // Colocar na fila de espera
        await db.collection(collections.conversations).doc(conversationId).update({
          status: 'waiting',
          waitingSince: new Date(),
        });

        return false;
      }

      // Atribuir conversa ao operador
      await db.collection(collections.conversations).doc(conversationId).update({
        status: 'human',
        assignedTo: operator.operatorId,
        assignedAt: new Date(),
        department: operator.department,
      });

      logger.info(
        `✅ Conversa ${conversationId} atribuída automaticamente a ${operator.operatorName}`
      );

      // Notificar operador
      const conversationDoc = await db
        .collection(collections.conversations)
        .doc(conversationId)
        .get();
      const conversation = conversationDoc.data();

      if (conversation) {
        await notificationService.notifyQueuedConversation(
          operator.operatorId,
          conversationId,
          conversation.customerName || 'Cliente'
        );
      }

      return true;
    } catch (error) {
      logger.error('Erro ao auto-atribuir conversa:', error);
      return false;
    }
  }

  /**
   * Processar fila de espera
   */
  async processWaitingQueue(): Promise<void> {
    try {
      const config = await this.getQueueConfig();

      if (!config.autoAssignEnabled) {
        return;
      }

      // Buscar conversas em espera
      const waitingSnapshot = await db
        .collection(collections.conversations)
        .where('status', '==', 'waiting')
        .orderBy('waitingSince', 'asc')
        .limit(10)
        .get();

      if (waitingSnapshot.empty) {
        return;
      }

      logger.info(`🔄 Processando ${waitingSnapshot.size} conversas em espera`);

      for (const doc of waitingSnapshot.docs) {
        const conversation = doc.data();
        await this.autoAssignConversation(
          doc.id,
          conversation.department,
          conversation.requiredSkills
        );

        // Aguardar um pouco entre atribuições
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      logger.error('Erro ao processar fila de espera:', error);
    }
  }

  /**
   * Obter estatísticas da fila
   */
  async getQueueStats(): Promise<{
    waiting: number;
    averageWaitTime: number;
    operatorsOnline: number;
    operatorsBusy: number;
    totalCapacity: number;
    usedCapacity: number;
  }> {
    try {
      // Conversas em espera
      const waitingSnapshot = await db
        .collection(collections.conversations)
        .where('status', '==', 'waiting')
        .get();

      // Calcular tempo médio de espera
      let totalWaitTime = 0;
      const now = new Date();

      waitingSnapshot.docs.forEach((doc) => {
        const conversation = doc.data();
        if (conversation.waitingSince) {
          const waitTime =
            (now.getTime() - conversation.waitingSince.toDate().getTime()) / 1000 / 60;
          totalWaitTime += waitTime;
        }
      });

      const averageWaitTime =
        waitingSnapshot.size > 0 ? totalWaitTime / waitingSnapshot.size : 0;

      // Operadores online
      const operatorsSnapshot = await db
        .collection(collections.users)
        .where('role', 'in', ['operator', 'supervisor', 'admin'])
        .where('status', 'in', ['online', 'available', 'busy'])
        .get();

      let totalCapacity = 0;
      let usedCapacity = 0;
      let operatorsBusy = 0;

      for (const doc of operatorsSnapshot.docs) {
        const user = doc.data();
        const maxChats = user.maxChats || 5;
        totalCapacity += maxChats;

        // Contar conversas ativas
        const activeChats = await db
          .collection(collections.conversations)
          .where('assignedTo', '==', doc.id)
          .where('status', 'in', ['human', 'waiting'])
          .get();

        usedCapacity += activeChats.size;

        if (activeChats.size >= maxChats) {
          operatorsBusy++;
        }
      }

      return {
        waiting: waitingSnapshot.size,
        averageWaitTime: Math.round(averageWaitTime),
        operatorsOnline: operatorsSnapshot.size,
        operatorsBusy,
        totalCapacity,
        usedCapacity,
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas da fila:', error);
      return {
        waiting: 0,
        averageWaitTime: 0,
        operatorsOnline: 0,
        operatorsBusy: 0,
        totalCapacity: 0,
        usedCapacity: 0,
      };
    }
  }
}

export const queueService = new QueueService();
