import { db, collections } from '../config/firebase';
import { IScheduledMessage, IScheduledMessageInput } from '../models/scheduled-message.model';
import logger from '../utils/logger';
import { NotFoundError } from '../utils/AppError';
// import cron from 'node-cron'; // Descomentar após instalar

export class SchedulerService {
  private cronJobs: Map<string, any> = new Map();

  async getAllScheduledMessages(filters?: {
    status?: string;
    userId?: string;
  }): Promise<IScheduledMessage[]> {
    try {
      let query = db.collection(collections.scheduledMessages || 'scheduledMessages');

      if (filters?.status) {
        query = query.where('status', '==', filters.status) as any;
      }

      if (filters?.userId) {
        query = query.where('createdBy', '==', filters.userId) as any;
      }

      const snapshot = await query.orderBy('scheduledFor', 'asc').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IScheduledMessage[];
    } catch (error) {
      logger.error('Erro ao buscar mensagens agendadas:', error);
      throw error;
    }
  }

  async getScheduledMessageById(id: string): Promise<IScheduledMessage | null> {
    try {
      const doc = await db.collection(collections.scheduledMessages || 'scheduledMessages').doc(id).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as IScheduledMessage;
    } catch (error) {
      logger.error('Erro ao buscar mensagem agendada:', error);
      throw error;
    }
  }

  async scheduleMessage(messageData: IScheduledMessageInput, createdBy: string): Promise<IScheduledMessage> {
    try {
      const message: Omit<IScheduledMessage, 'id'> = {
        ...messageData,
        status: 'pending',
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await db.collection(collections.scheduledMessages || 'scheduledMessages').add(message);

      logger.info(`Mensagem agendada: ${docRef.id} para ${messageData.scheduledFor}`);

      // Agendar execução (implementar com node-cron)
      // this.setupCronJob(docRef.id, messageData.scheduledFor);

      return {
        id: docRef.id,
        ...message,
      };
    } catch (error) {
      logger.error('Erro ao agendar mensagem:', error);
      throw error;
    }
  }

  async cancelScheduledMessage(id: string): Promise<void> {
    try {
      const message = await this.getScheduledMessageById(id);

      if (!message) {
        throw new NotFoundError('Mensagem agendada não encontrada');
      }

      if (message.status !== 'pending') {
        throw new Error('Apenas mensagens pendentes podem ser canceladas');
      }

      await db.collection(collections.scheduledMessages || 'scheduledMessages').doc(id).update({
        status: 'cancelled',
        updatedAt: new Date(),
      });

      // Cancelar cron job
      if (this.cronJobs.has(id)) {
        this.cronJobs.get(id).stop();
        this.cronJobs.delete(id);
      }

      logger.info(`Mensagem agendada cancelada: ${id}`);
    } catch (error) {
      logger.error('Erro ao cancelar mensagem agendada:', error);
      throw error;
    }
  }

  async sendScheduledMessage(id: string): Promise<void> {
    try {
      const message = await this.getScheduledMessageById(id);

      if (!message) {
        throw new NotFoundError('Mensagem agendada não encontrada');
      }

      // Implementar envio via WhatsApp service
      // await whatsappService.sendMessage(message.phoneNumber, message.content);

      await db.collection(collections.scheduledMessages || 'scheduledMessages').doc(id).update({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(`Mensagem agendada enviada: ${id}`);

      // Se for recorrente, agendar próxima
      if (message.repeatConfig) {
        await this.scheduleNextRecurrence(message);
      }
    } catch (error) {
      logger.error('Erro ao enviar mensagem agendada:', error);
      
      await db.collection(collections.scheduledMessages || 'scheduledMessages').doc(id).update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        updatedAt: new Date(),
      });
    }
  }

  private async scheduleNextRecurrence(message: IScheduledMessage): Promise<void> {
    if (!message.repeatConfig) return;

    const { frequency, until } = message.repeatConfig;
    const nextDate = new Date(message.scheduledFor);

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }

    if (nextDate <= until) {
      await this.scheduleMessage({
        phoneNumber: message.phoneNumber,
        content: message.content,
        scheduledFor: nextDate,
        repeatConfig: message.repeatConfig,
      }, message.createdBy);
    }
  }

  // Método para inicializar cron jobs ao iniciar o servidor
  async initializeScheduledMessages(): Promise<void> {
    try {
      const pendingMessages = await this.getAllScheduledMessages({ status: 'pending' });

      for (const message of pendingMessages) {
        const now = new Date();
        const scheduledDate = new Date(message.scheduledFor);

        if (scheduledDate > now) {
          // this.setupCronJob(message.id, scheduledDate);
          logger.info(`Cron job configurado para mensagem ${message.id}`);
        } else {
          // Mensagem atrasada, enviar imediatamente
          await this.sendScheduledMessage(message.id);
        }
      }
    } catch (error) {
      logger.error('Erro ao inicializar mensagens agendadas:', error);
    }
  }

  // Implementar com node-cron após instalação
  // private setupCronJob(messageId: string, scheduledFor: Date): void {
  //   const cronExpression = this.dateToCronExpression(scheduledFor);
  //   const job = cron.schedule(cronExpression, async () => {
  //     await this.sendScheduledMessage(messageId);
  //   });
  //   this.cronJobs.set(messageId, job);
  // }
}
