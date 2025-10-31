import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { ExportService } from '../services/export.service.js';
import logger from '../utils/logger.js';

const exportService = new ExportService();

export const exportConversations = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, departmentId, status, format } = req.query;
    
    const data = await exportService.exportConversations({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      departmentId: departmentId as string,
      status: status as string,
      format: (format as 'csv' | 'json') || 'json',
    });

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `conversas_${Date.now()}.${format || 'json'}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    logger.error('Erro ao exportar conversas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao exportar conversas',
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

    const data = await exportService.exportAnalytics({
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      format: (format as 'csv' | 'json') || 'json',
    });

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `analytics_${Date.now()}.${format || 'json'}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    logger.error('Erro ao exportar analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao exportar analytics',
    });
  }
};

export const exportFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, operatorId, format } = req.query;
    
    const data = await exportService.exportFeedback({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      operatorId: operatorId as string,
      format: (format as 'csv' | 'json') || 'json',
    });

    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `feedback_${Date.now()}.${format || 'json'}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    logger.error('Erro ao exportar feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao exportar feedback',
    });
  }
};
