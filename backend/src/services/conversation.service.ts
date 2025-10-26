import { db } from '../config/firebase';
import { IConversation, IMessage, CreateMessageDTO, CloseConversationDTO } from '../types/conversation.types';
import logger from '../utils/logger';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

export class ConversationService {
  /**
   * Buscar todas as conversas com filtros opcionais
   */
  async getAllConversations(filters?: {
    status?: string;
    assignedTo?: string;
    departmentId?: string;
  }): Promise<IConversation[]> {
    try {
      let query: any = db.collection(CONVERSATIONS_COLLECTION);

      // Aplicar filtros
      if (filters?.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters?.assignedTo) {
        query = query.where('assignedTo', '==', filters.assignedTo);
      }
      if (filters?.departmentId) {
        query = query.where('departmentId', '==', filters.departmentId);
      }

      const snapshot = await query
        .orderBy('lastActivity', 'desc')
        .get();

      const conversations: IConversation[] = [];
      snapshot.forEach((doc: any) => {
        conversations.push({ id: doc.id, ...doc.data() } as IConversation);
      });

      logger.info(`✅ ${conversations.length} conversas encontradas`);
      return conversations;
    } catch (error) {
      logger.error('Erro ao buscar conversas:', error);
      throw error;
    }
  }

  /**
   * Buscar conversa por ID
   */
  async getConversationById(id: string): Promise<IConversation | null> {
    try {
      const doc = await db.collection(CONVERSATIONS_COLLECTION).doc(id).get();
      
      if (!doc.exists) {
        return null;
      }

      return { id: doc.id, ...doc.data() } as IConversation;
    } catch (error) {
      logger.error('Erro ao buscar conversa:', error);
      throw error;
    }
  }

  /**
   * Buscar mensagens de uma conversa
   */
  async getConversationMessages(conversationId: string): Promise<IMessage[]> {
    try {
      logger.info(`🔍 Buscando mensagens da conversa: ${conversationId}`);
      
      const snapshot = await db
        .collection(MESSAGES_COLLECTION)
        .where('conversationId', '==', conversationId)
        .get();

      const messages: IMessage[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        logger.info(`📨 Mensagem do Firestore:`, {
          id: doc.id,
          content: data.content?.substring(0, 30),
          senderId: data.senderId,
          isFromBot: data.isFromBot,
        });
        messages.push({ id: doc.id, ...data } as IMessage);
      });

      // Ordenar no código ao invés do Firestore (evita erro de índice)
      messages.sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      logger.info(`✅ ${messages.length} mensagens encontradas`);
      
      return messages;
    } catch (error) {
      logger.error('❌ Erro ao buscar mensagens:', error);
      throw error;
    }
  }

  /**
   * Enviar mensagem em uma conversa
   */
  async sendMessage(
    conversationId: string,
    userId: string,
    data: CreateMessageDTO
  ): Promise<IMessage> {
    try {
      // Verificar se a conversa existe
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      // Criar mensagem
      const message: Omit<IMessage, 'id'> = {
        conversationId,
        senderId: userId,
        content: data.content,
        type: data.type || 'text',
        timestamp: new Date(),
        isFromBot: data.isFromBot || false,
        isRead: false,
      };

      const docRef = await db.collection(MESSAGES_COLLECTION).add(message);
      const newMessage = { id: docRef.id, ...message };

      // Atualizar última mensagem e atividade da conversa
      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update({
        lastMessage: {
          id: newMessage.id,
          content: data.content,
          timestamp: new Date(),
          isFromBot: data.isFromBot || false,
        },
        lastActivity: new Date(),
        updatedAt: new Date(),
      });

      logger.info(`✅ Mensagem enviada na conversa ${conversationId}`);
      
      // IMPORTANTE: Enviar mensagem para o WhatsApp
      try {
        const { getWhatsAppManager } = require('./whatsapp/whatsapp.manager');
        const whatsappManager = getWhatsAppManager();
        
        if (conversation.phoneNumber) {
          await whatsappManager.sendMessage(conversation.phoneNumber, data.content);
          logger.info(`📱 Mensagem enviada para WhatsApp: ${conversation.phoneNumber}`);
        }
      } catch (whatsappError) {
        logger.error('❌ Erro ao enviar mensagem para WhatsApp:', whatsappError);
        // Não falhar a requisição se o WhatsApp falhar
      }
      
      return newMessage;
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  }

  /**
   * Transferir conversa para operador com observação
   */
  async transferConversation(
    conversationId: string,
    operatorId: string,
    transferredBy: string,
    note?: string
  ): Promise<IConversation> {
    try {
      const conversation = await this.getConversationById(conversationId);
      
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      // Atualizar conversa
      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update({
        assignedTo: operatorId,
        status: 'human',
        transferNote: note || '',
        transferredBy,
        transferredAt: new Date(),
        updatedAt: new Date(),
      });

      // Criar mensagem de sistema sobre a transferência
      const systemMessage = {
        conversationId,
        senderId: 'system',
        content: note 
          ? `Conversa transferida. Observação: ${note}`
          : 'Conversa transferida para atendente',
        type: 'system',
        timestamp: new Date(),
        isFromBot: false,
        isRead: false,
      };

      await db.collection(MESSAGES_COLLECTION).add(systemMessage);

      logger.info(`✅ Conversa ${conversationId} transferida para ${operatorId}`);

      return {
        ...conversation,
        assignedTo: operatorId,
        status: 'human' as any,
      };
    } catch (error) {
      logger.error('Erro ao transferir conversa:', error);
      throw error;
    }
  }

  /**
   * Fechar conversa manualmente
   */
  async closeConversation(
    conversationId: string,
    userId: string,
    data?: CloseConversationDTO
  ): Promise<IConversation> {
    try {
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      if (conversation.status === 'closed') {
        throw new Error('Conversa já está fechada');
      }

      // Atualizar conversa
      const updateData = {
        status: 'closed' as const,
        closedAt: new Date(),
        closedBy: userId,
        closureReason: data?.reason || 'manual',
        updatedAt: new Date(),
      };

      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update(updateData);

      // Se houver nota, adicionar como mensagem do sistema
      if (data?.note) {
        await this.sendMessage(conversationId, userId, {
          content: `[Sistema] Conversa encerrada: ${data.note}`,
          type: 'text',
          isFromBot: true,
        });
      }

      logger.info(`✅ Conversa ${conversationId} fechada por ${userId}`);

      return {
        ...conversation,
        ...updateData,
      };
    } catch (error) {
      logger.error('Erro ao fechar conversa:', error);
      throw error;
    }
  }

  /**
   * Reabrir conversa
   */
  async reopenConversation(conversationId: string, userId: string): Promise<IConversation> {
    try {
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      if (conversation.status !== 'closed') {
        throw new Error('Apenas conversas fechadas podem ser reabertas');
      }

      const updateData = {
        status: 'waiting' as const,
        closedAt: null,
        closedBy: null,
        closureReason: null,
        updatedAt: new Date(),
        lastActivity: new Date(),
      };

      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update(updateData);

      logger.info(`✅ Conversa ${conversationId} reaberta por ${userId}`);

      return {
        ...conversation,
        ...updateData,
      } as IConversation;
    } catch (error) {
      logger.error('Erro ao reabrir conversa:', error);
      throw error;
    }
  }

  /**
   * Atribuir conversa a um operador
   */
  async assignConversation(
    conversationId: string,
    operatorId: string,
    operatorName: string
  ): Promise<IConversation> {
    try {
      const conversation = await this.getConversationById(conversationId);
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      const updateData = {
        assignedTo: operatorId,
        assignedToName: operatorName,
        status: 'human' as const,
        updatedAt: new Date(),
      };

      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update(updateData);

      logger.info(`✅ Conversa ${conversationId} atribuída a ${operatorName}`);

      return {
        ...conversation,
        ...updateData,
      };
    } catch (error) {
      logger.error('Erro ao atribuir conversa:', error);
      throw error;
    }
  }

  /**
   * Marcar mensagens como lidas
   */
  async markMessagesAsRead(conversationId: string): Promise<void> {
    try {
      const snapshot = await db
        .collection(MESSAGES_COLLECTION)
        .where('conversationId', '==', conversationId)
        .where('isRead', '==', false)
        .get();

      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
      });

      await batch.commit();
      logger.info(`✅ Mensagens da conversa ${conversationId} marcadas como lidas`);
    } catch (error) {
      logger.error('Erro ao marcar mensagens como lidas:', error);
      throw error;
    }
  }
}
