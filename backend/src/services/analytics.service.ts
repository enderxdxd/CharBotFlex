import { db, collections } from '../config/firebase';
import { IAnalytics, IOperatorPerformance, IConversationTrend } from '../models/analytics.model';
import logger from '../utils/logger';

export class AnalyticsService {
  async getAnalytics(filters: {
    startDate?: Date;
    endDate?: Date;
    departmentId?: string;
  }): Promise<IAnalytics> {
    try {
      const { startDate, endDate, departmentId } = filters;
      
      let conversationsQuery = db.collection(collections.conversations);
      
      if (startDate) {
        conversationsQuery = conversationsQuery.where('createdAt', '>=', startDate) as any;
      }
      
      if (endDate) {
        conversationsQuery = conversationsQuery.where('createdAt', '<=', endDate) as any;
      }
      
      if (departmentId) {
        conversationsQuery = conversationsQuery.where('departmentId', '==', departmentId) as any;
      }
      
      const conversationsSnapshot = await conversationsQuery.get();
      const conversations = conversationsSnapshot.docs.map(doc => doc.data());
      
      // Calcular métricas
      const totalConversations = conversations.length;
      const activeConversations = conversations.filter(c => c.status === 'human' || c.status === 'bot').length;
      const closedConversations = conversations.filter(c => c.status === 'closed').length;
      
      // Calcular tempo médio de resposta (simplificado)
      const averageResponseTime = await this.calculateAverageResponseTime(conversations);
      
      // Taxa de resolução do bot
      const botResolved = conversations.filter(c => c.status === 'closed' && !c.assignedTo).length;
      const botResolutionRate = totalConversations > 0 ? (botResolved / totalConversations) * 100 : 0;
      
      // Score de satisfação
      const satisfactionScore = await this.calculateSatisfactionScore(filters);
      
      // Top issues (tags mais usadas)
      const topIssues = await this.getTopIssues(conversations);
      
      // Horários de pico
      const peakHours = this.calculatePeakHours(conversations);
      
      // Performance dos operadores
      const operatorPerformance = await this.getOperatorPerformance(filters);
      
      return {
        totalConversations,
        activeConversations,
        closedConversations,
        averageResponseTime,
        botResolutionRate,
        satisfactionScore,
        topIssues,
        peakHours,
        operatorPerformance,
      };
    } catch (error) {
      logger.error('Erro ao buscar analytics:', error);
      throw error;
    }
  }

  private async calculateAverageResponseTime(conversations: any[]): Promise<number> {
    // Implementação simplificada
    // Em produção, calcular baseado nos timestamps das mensagens
    return 120; // 2 minutos (exemplo)
  }

  private async calculateSatisfactionScore(filters: any): Promise<number> {
    try {
      let feedbackQuery = db.collection(collections.feedback || 'feedback');
      
      if (filters.startDate) {
        feedbackQuery = feedbackQuery.where('createdAt', '>=', filters.startDate) as any;
      }
      
      if (filters.endDate) {
        feedbackQuery = feedbackQuery.where('createdAt', '<=', filters.endDate) as any;
      }
      
      const feedbackSnapshot = await feedbackQuery.get();
      
      if (feedbackSnapshot.empty) {
        return 0;
      }
      
      const ratings = feedbackSnapshot.docs.map(doc => doc.data().rating);
      const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      
      return Math.round(average * 10) / 10;
    } catch (error) {
      logger.error('Erro ao calcular satisfaction score:', error);
      return 0;
    }
  }

  private async getTopIssues(conversations: any[]): Promise<Array<{ tag: string; count: number }>> {
    const tagCounts: { [key: string]: number } = {};
    
    conversations.forEach(conv => {
      if (conv.tags && Array.isArray(conv.tags)) {
        conv.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private calculatePeakHours(conversations: any[]): Array<{ hour: number; count: number }> {
    const hourCounts: { [key: number]: number } = {};
    
    conversations.forEach(conv => {
      if (conv.createdAt) {
        const hour = new Date(conv.createdAt.toDate()).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });
    
    return Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  async getOperatorPerformance(filters: any): Promise<IOperatorPerformance[]> {
    try {
      const usersSnapshot = await db.collection(collections.users)
        .where('role', 'in', ['operator', 'supervisor'])
        .get();
      
      const performance: IOperatorPerformance[] = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        let conversationsQuery = db.collection(collections.conversations)
          .where('assignedTo', '==', userDoc.id);
        
        if (filters.startDate) {
          conversationsQuery = conversationsQuery.where('createdAt', '>=', filters.startDate) as any;
        }
        
        const userConversations = await conversationsQuery.get();
        const totalChats = userConversations.size;
        const resolvedChats = userConversations.docs.filter(doc => doc.data().status === 'closed').length;
        const activeChats = userConversations.docs.filter(doc => 
          doc.data().status === 'human' || doc.data().status === 'bot'
        ).length;
        
        // Buscar feedback do operador
        const feedbackSnapshot = await db.collection(collections.feedback || 'feedback')
          .where('operatorId', '==', userDoc.id)
          .get();
        
        const ratings = feedbackSnapshot.docs.map(doc => doc.data().rating);
        const satisfactionScore = ratings.length > 0
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          : 0;
        
        performance.push({
          operatorId: userDoc.id,
          operatorName: userData.name,
          totalChats,
          averageResponseTime: 120, // Simplificado
          satisfactionScore: Math.round(satisfactionScore * 10) / 10,
          resolvedChats,
          activeChats,
        });
      }
      
      return performance.sort((a, b) => b.totalChats - a.totalChats);
    } catch (error) {
      logger.error('Erro ao buscar performance dos operadores:', error);
      return [];
    }
  }

  async getConversationTrends(filters: {
    startDate: Date;
    endDate: Date;
  }): Promise<IConversationTrend[]> {
    try {
      const conversationsSnapshot = await db.collection(collections.conversations)
        .where('createdAt', '>=', filters.startDate)
        .where('createdAt', '<=', filters.endDate)
        .get();
      
      const conversationsByDate: { [key: string]: any } = {};
      
      conversationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const date = new Date(data.createdAt.toDate()).toISOString().split('T')[0];
        
        if (!conversationsByDate[date]) {
          conversationsByDate[date] = { total: 0, bot: 0, human: 0, closed: 0 };
        }
        
        conversationsByDate[date].total++;
        
        if (data.status === 'bot') conversationsByDate[date].bot++;
        if (data.status === 'human') conversationsByDate[date].human++;
        if (data.status === 'closed') conversationsByDate[date].closed++;
      });
      
      return Object.entries(conversationsByDate)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      logger.error('Erro ao buscar tendências de conversas:', error);
      return [];
    }
  }
}
