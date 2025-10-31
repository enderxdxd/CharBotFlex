import { db, collections } from '../config/firebase.js';
import { IFeedback, IFeedbackInput, IFeedbackStats } from '../models/feedback.model.js';
import logger from '../utils/logger.js';
import { NotFoundError } from '../utils/AppError.js';

export class FeedbackService {
  async getAllFeedback(filters?: {
    operatorId?: string;
    startDate?: Date;
    endDate?: Date;
    minRating?: number;
  }): Promise<IFeedback[]> {
    try {
      let query = db.collection(collections.feedback || 'feedback');

      if (filters?.operatorId) {
        query = query.where('operatorId', '==', filters.operatorId) as any;
      }

      if (filters?.startDate) {
        query = query.where('createdAt', '>=', filters.startDate) as any;
      }

      if (filters?.endDate) {
        query = query.where('createdAt', '<=', filters.endDate) as any;
      }

      if (filters?.minRating) {
        query = query.where('rating', '>=', filters.minRating) as any;
      }

      const snapshot = await query.orderBy('createdAt', 'desc').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IFeedback[];
    } catch (error) {
      logger.error('Erro ao buscar feedbacks:', error);
      throw error;
    }
  }

  async getFeedbackById(id: string): Promise<IFeedback | null> {
    try {
      const doc = await db.collection(collections.feedback || 'feedback').doc(id).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as IFeedback;
    } catch (error) {
      logger.error('Erro ao buscar feedback:', error);
      throw error;
    }
  }

  async createFeedback(feedbackData: IFeedbackInput): Promise<IFeedback> {
    try {
      // Buscar informações da conversa
      const conversationDoc = await db.collection(collections.conversations)
        .doc(feedbackData.conversationId)
        .get();

      if (!conversationDoc.exists) {
        throw new NotFoundError('Conversa não encontrada');
      }

      const conversationData = conversationDoc.data();

      if (!conversationData?.assignedTo) {
        throw new Error('Conversa não tem operador atribuído');
      }

      // Buscar informações do operador
      const operatorDoc = await db.collection(collections.users)
        .doc(conversationData.assignedTo)
        .get();

      if (!operatorDoc.exists) {
        throw new NotFoundError('Operador não encontrado');
      }

      const operatorData = operatorDoc.data();

      const feedback: Omit<IFeedback, 'id'> = {
        ...feedbackData,
        operatorId: conversationData.assignedTo,
        operatorName: operatorData?.name || 'Desconhecido',
        customerPhone: conversationData.phoneNumber,
        customerName: conversationData.contactName,
        createdAt: new Date(),
      };

      const docRef = await db.collection(collections.feedback || 'feedback').add(feedback);

      logger.info(`Feedback criado: ${docRef.id} - Rating: ${feedbackData.rating}`);

      return {
        id: docRef.id,
        ...feedback,
      };
    } catch (error) {
      logger.error('Erro ao criar feedback:', error);
      throw error;
    }
  }

  async getFeedbackStats(filters?: {
    operatorId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<IFeedbackStats> {
    try {
      const feedbacks = await this.getAllFeedback(filters);

      if (feedbacks.length === 0) {
        return {
          totalFeedbacks: 0,
          averageRating: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          positivePercentage: 0,
          negativePercentage: 0,
        };
      }

      const totalFeedbacks = feedbacks.length;
      const sumRatings = feedbacks.reduce((sum, f) => sum + f.rating, 0);
      const averageRating = Math.round((sumRatings / totalFeedbacks) * 10) / 10;

      const ratingDistribution = {
        1: feedbacks.filter(f => f.rating === 1).length,
        2: feedbacks.filter(f => f.rating === 2).length,
        3: feedbacks.filter(f => f.rating === 3).length,
        4: feedbacks.filter(f => f.rating === 4).length,
        5: feedbacks.filter(f => f.rating === 5).length,
      };

      const positiveCount = ratingDistribution[4] + ratingDistribution[5];
      const negativeCount = ratingDistribution[1] + ratingDistribution[2];

      const positivePercentage = Math.round((positiveCount / totalFeedbacks) * 100);
      const negativePercentage = Math.round((negativeCount / totalFeedbacks) * 100);

      return {
        totalFeedbacks,
        averageRating,
        ratingDistribution,
        positivePercentage,
        negativePercentage,
      };
    } catch (error) {
      logger.error('Erro ao calcular estatísticas de feedback:', error);
      throw error;
    }
  }

  async sendFeedbackRequest(conversationId: string): Promise<void> {
    try {
      const conversationDoc = await db.collection(collections.conversations)
        .doc(conversationId)
        .get();

      if (!conversationDoc.exists) {
        throw new NotFoundError('Conversa não encontrada');
      }

      const conversationData = conversationDoc.data();

      // Implementar envio de mensagem via WhatsApp
      // const message = `Obrigado pelo atendimento! Por favor, avalie nosso atendimento de 1 a 5 estrelas.`;
      // await whatsappService.sendMessage(conversationData.phoneNumber, message);

      logger.info(`Solicitação de feedback enviada para conversa ${conversationId}`);
    } catch (error) {
      logger.error('Erro ao enviar solicitação de feedback:', error);
      throw error;
    }
  }
}
