import { Response } from 'express';
import { AuthRequest } from '../types';
import { AnalyticsService } from '../services/analytics.service';
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
