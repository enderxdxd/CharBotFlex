import { Response } from 'express';
import { AuthRequest } from '../types';
import { AnalyticsService } from '../services/analytics.service';
import { db, collections } from '../config/firebase';
import logger from '../utils/logger';

const analyticsService = new AnalyticsService();

export const getAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      departmentId: departmentId as string,
    };
    
    const analytics = await analyticsService.getAnalytics(filters);
    
    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Erro ao buscar analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar analytics',
    });
  }
};

export const getOperatorPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filters = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };
    
    const performance = await analyticsService.getOperatorPerformance(filters);
    
    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    logger.error('Erro ao buscar performance dos operadores:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar performance dos operadores',
    });
  }
};

export const getConversationTrends = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são obrigatórios',
      });
    }
    
    const trends = await analyticsService.getConversationTrends({
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
    });
    
    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    logger.error('Erro ao buscar tendências:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar tendências',
    });
  }
};

export const exportAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, format } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são obrigatórios',
      });
    }

    const analytics = await analyticsService.getAnalytics({
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
    });

    if (format === 'csv') {
      const csv = convertAnalyticsToCSV(analytics);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics_${Date.now()}.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: analytics,
      });
    }
  } catch (error) {
    logger.error('Erro ao exportar analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao exportar analytics',
    });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const analytics = await analyticsService.getAnalytics({
      startDate: startOfDay,
      endDate: endOfDay,
    });

    res.json({
      success: true,
      data: {
        totalConversations: analytics.totalConversations,
        activeConversations: analytics.activeConversations,
        closedConversations: analytics.closedConversations,
        averageResponseTime: analytics.averageResponseTime,
        satisfactionScore: analytics.satisfactionScore,
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar estatísticas do dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatísticas',
    });
  }
};

export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Buscar atividades recentes (simplificado)
    const recentConversations = await db.collection(collections.conversations)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    const activities = recentConversations.docs.map(doc => ({
      id: doc.id,
      type: 'conversation',
      ...doc.data(),
    }));

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    logger.error('Erro ao buscar atividades recentes:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar atividades',
    });
  }
};

function convertAnalyticsToCSV(analytics: any): string {
  const rows = [
    'Métrica,Valor',
    `Total de Conversas,${analytics.totalConversations}`,
    `Conversas Ativas,${analytics.activeConversations}`,
    `Conversas Fechadas,${analytics.closedConversations}`,
    `Tempo Médio de Resposta (s),${analytics.averageResponseTime}`,
    `Taxa de Resolução do Bot (%),${analytics.botResolutionRate}`,
    `Score de Satisfação,${analytics.satisfactionScore}`,
  ];
  return rows.join('\n');
}
