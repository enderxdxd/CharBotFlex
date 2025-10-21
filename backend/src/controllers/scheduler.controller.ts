import { Response } from 'express';
import { AuthRequest } from '../types';
import { SchedulerService } from '../services/scheduler.service';
import { db, collections } from '../config/firebase';
import logger from '../utils/logger';

const schedulerService = new SchedulerService();

export const getAllScheduledMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    
    const messages = await schedulerService.getAllScheduledMessages({
      status: status as string,
      userId: req.user?.uid,
    });

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    logger.error('Erro ao buscar mensagens agendadas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar mensagens agendadas',
    });
  }
};

export const getScheduledMessageById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const message = await schedulerService.getScheduledMessageById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Mensagem agendada não encontrada',
      });
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    logger.error('Erro ao buscar mensagem agendada:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar mensagem agendada',
    });
  }
};

export const scheduleMessage = async (req: AuthRequest, res: Response) => {
  try {
    const message = await schedulerService.scheduleMessage(req.body, req.user!.uid);

    res.status(201).json({
      success: true,
      data: message,
      message: 'Mensagem agendada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao agendar mensagem:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao agendar mensagem',
    });
  }
};

export const updateScheduledMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verificar se a mensagem existe
    const existingMessage = await schedulerService.getScheduledMessageById(id);
    
    if (!existingMessage) {
      return res.status(404).json({
        success: false,
        error: 'Mensagem agendada não encontrada',
      });
    }

    // Verificar se o usuário é o criador ou admin
    if (existingMessage.createdBy !== req.user?.uid && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para atualizar esta mensagem',
      });
    }

    // Atualizar apenas se estiver pendente
    if (existingMessage.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Apenas mensagens pendentes podem ser atualizadas',
      });
    }

    await db.collection(collections.scheduledMessages || 'scheduledMessages').doc(id).update({
      ...updates,
      updatedAt: new Date(),
    });

    const updatedMessage = await schedulerService.getScheduledMessageById(id);

    res.json({
      success: true,
      data: updatedMessage,
      message: 'Mensagem atualizada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao atualizar mensagem agendada:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao atualizar mensagem',
    });
  }
};

export const cancelScheduledMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se a mensagem existe
    const existingMessage = await schedulerService.getScheduledMessageById(id);
    
    if (!existingMessage) {
      return res.status(404).json({
        success: false,
        error: 'Mensagem agendada não encontrada',
      });
    }

    // Verificar se o usuário é o criador ou admin
    if (existingMessage.createdBy !== req.user?.uid && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para cancelar esta mensagem',
      });
    }

    await schedulerService.cancelScheduledMessage(id);

    res.json({
      success: true,
      message: 'Mensagem cancelada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao cancelar mensagem agendada:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao cancelar mensagem',
    });
  }
};
