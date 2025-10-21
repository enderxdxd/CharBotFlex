import { Response } from 'express';
import { AuthRequest } from '../types';
import { FeedbackService } from '../services/feedback.service';
import { db, collections } from '../config/firebase';
import logger from '../utils/logger';

const feedbackService = new FeedbackService();

export const getAllFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { operatorId, startDate, endDate, minRating } = req.query;
    
    const feedbacks = await feedbackService.getAllFeedback({
      operatorId: operatorId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      minRating: minRating ? parseInt(minRating as string) : undefined,
    });

    res.json({
      success: true,
      data: feedbacks,
    });
  } catch (error) {
    logger.error('Erro ao buscar feedbacks:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar feedbacks',
    });
  }
};

export const getFeedbackById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const feedback = await feedbackService.getFeedbackById(id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: 'Feedback não encontrado',
      });
    }

    res.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    logger.error('Erro ao buscar feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar feedback',
    });
  }
};

export const createFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body);

    res.status(201).json({
      success: true,
      data: feedback,
      message: 'Feedback criado com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao criar feedback:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao criar feedback',
    });
  }
};

export const getFeedbackStats = async (req: AuthRequest, res: Response) => {
  try {
    const { operatorId, startDate, endDate } = req.query;
    
    const stats = await feedbackService.getFeedbackStats({
      operatorId: operatorId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Erro ao buscar estatísticas de feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatísticas',
    });
  }
};

export const deleteFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário é admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem deletar feedbacks',
      });
    }

    await db.collection(collections.feedback || 'feedback').doc(id).delete();

    res.json({
      success: true,
      message: 'Feedback deletado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao deletar feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar feedback',
    });
  }
};
