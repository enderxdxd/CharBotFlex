import { db, collections } from '../config/firebase';
import logger from '../utils/logger';

export class ExportService {
  async exportConversations(filters: {
    startDate?: Date;
    endDate?: Date;
    departmentId?: string;
    status?: string;
    format: 'csv' | 'json';
  }): Promise<string> {
    try {
      let query = db.collection(collections.conversations);

      if (filters.startDate) {
        query = query.where('createdAt', '>=', filters.startDate) as any;
      }

      if (filters.endDate) {
        query = query.where('createdAt', '<=', filters.endDate) as any;
      }

      if (filters.departmentId) {
        query = query.where('departmentId', '==', filters.departmentId) as any;
      }

      if (filters.status) {
        query = query.where('status', '==', filters.status) as any;
      }

      const snapshot = await query.get();
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (filters.format === 'csv') {
        return this.convertToCSV(conversations);
      } else {
        return JSON.stringify(conversations, null, 2);
      }
    } catch (error) {
      logger.error('Erro ao exportar conversas:', error);
      throw error;
    }
  }

  async exportAnalytics(filters: {
    startDate: Date;
    endDate: Date;
    format: 'csv' | 'json';
  }): Promise<string> {
    try {
      // Buscar dados de analytics
      const conversationsSnapshot = await db.collection(collections.conversations)
        .where('createdAt', '>=', filters.startDate)
        .where('createdAt', '<=', filters.endDate)
        .get();

      const feedbackSnapshot = await db.collection(collections.feedback || 'feedback')
        .where('createdAt', '>=', filters.startDate)
        .where('createdAt', '<=', filters.endDate)
        .get();

      const analyticsData = {
        period: {
          start: filters.startDate.toISOString(),
          end: filters.endDate.toISOString(),
        },
        conversations: {
          total: conversationsSnapshot.size,
          byStatus: this.groupByField(conversationsSnapshot.docs, 'status'),
        },
        feedback: {
          total: feedbackSnapshot.size,
          averageRating: this.calculateAverageRating(feedbackSnapshot.docs),
          byRating: this.groupByField(feedbackSnapshot.docs, 'rating'),
        },
      };

      if (filters.format === 'csv') {
        return this.convertAnalyticsToCSV(analyticsData);
      } else {
        return JSON.stringify(analyticsData, null, 2);
      }
    } catch (error) {
      logger.error('Erro ao exportar analytics:', error);
      throw error;
    }
  }

  async exportFeedback(filters: {
    startDate?: Date;
    endDate?: Date;
    operatorId?: string;
    format: 'csv' | 'json';
  }): Promise<string> {
    try {
      let query = db.collection(collections.feedback || 'feedback');

      if (filters.startDate) {
        query = query.where('createdAt', '>=', filters.startDate) as any;
      }

      if (filters.endDate) {
        query = query.where('createdAt', '<=', filters.endDate) as any;
      }

      if (filters.operatorId) {
        query = query.where('operatorId', '==', filters.operatorId) as any;
      }

      const snapshot = await query.get();
      const feedbacks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (filters.format === 'csv') {
        return this.convertToCSV(feedbacks);
      } else {
        return JSON.stringify(feedbacks, null, 2);
      }
    } catch (error) {
      logger.error('Erro ao exportar feedbacks:', error);
      throw error;
    }
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) {
      return '';
    }

    // Obter headers
    const headers = Object.keys(data[0]);
    
    // Criar linhas CSV
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escapar valores que contêm vírgula ou aspas
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  private convertAnalyticsToCSV(data: any): string {
    const rows = [
      'Métrica,Valor',
      `Período Início,${data.period.start}`,
      `Período Fim,${data.period.end}`,
      `Total de Conversas,${data.conversations.total}`,
      `Média de Avaliação,${data.feedback.averageRating}`,
      `Total de Feedbacks,${data.feedback.total}`,
    ];

    return rows.join('\n');
  }

  private groupByField(docs: any[], field: string): { [key: string]: number } {
    const grouped: { [key: string]: number } = {};
    
    docs.forEach(doc => {
      const value = doc.data()[field];
      grouped[value] = (grouped[value] || 0) + 1;
    });

    return grouped;
  }

  private calculateAverageRating(docs: any[]): number {
    if (docs.length === 0) return 0;
    
    const sum = docs.reduce((acc, doc) => acc + (doc.data().rating || 0), 0);
    return Math.round((sum / docs.length) * 10) / 10;
  }
}
