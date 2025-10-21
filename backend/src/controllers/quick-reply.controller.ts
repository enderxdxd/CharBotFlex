import { Response } from 'express';
import { AuthRequest } from '../types';
import { QuickReplyService } from '../services/quick-reply.service';
import logger from '../utils/logger';
import { ForbiddenError } from '../utils/AppError';

const quickReplyService = new QuickReplyService();

export const getAllQuickReplies = async (req: AuthRequest, res: Response) => {
  try {
    const { departmentId } = req.query;
    
    const replies = await quickReplyService.getAllQuickReplies({
      departmentId: departmentId as string,
      userId: req.user?.uid,
    });

    res.json({
      success: true,
      data: replies,
    });
  } catch (error) {
    logger.error('Erro ao buscar respostas rápidas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar respostas rápidas',
    });
  }
};

export const getQuickReplyById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const reply = await quickReplyService.getQuickReplyById(id);

    if (!reply) {
      return res.status(404).json({
        success: false,
        error: 'Resposta rápida não encontrada',
      });
    }

    res.json({
      success: true,
      data: reply,
    });
  } catch (error) {
    logger.error('Erro ao buscar resposta rápida:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar resposta rápida',
    });
  }
};

export const getQuickReplyByShortcut = async (req: AuthRequest, res: Response) => {
  try {
    const { shortcut } = req.params;
    const { departmentId } = req.query;
    
    const reply = await quickReplyService.getQuickReplyByShortcut(
      shortcut,
      departmentId as string
    );

    if (!reply) {
      return res.status(404).json({
        success: false,
        error: 'Resposta rápida não encontrada',
      });
    }

    // Incrementar contador de uso
    await quickReplyService.incrementUsageCount(reply.id);

    res.json({
      success: true,
      data: reply,
    });
  } catch (error) {
    logger.error('Erro ao buscar resposta rápida:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar resposta rápida',
    });
  }
};

export const createQuickReply = async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, shortcut, departmentId, tags, isGlobal } = req.body;

    // Verificar permissões para respostas globais
    if (isGlobal && req.user?.role !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem criar respostas globais');
    }

    const reply = await quickReplyService.createQuickReply(
      { title, content, shortcut, departmentId, tags, isGlobal },
      req.user!.uid
    );

    res.status(201).json({
      success: true,
      data: reply,
      message: 'Resposta rápida criada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao criar resposta rápida:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao criar resposta rápida',
    });
  }
};

export const updateQuickReply = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verificar se o usuário é o criador ou admin
    const existingReply = await quickReplyService.getQuickReplyById(id);
    
    if (!existingReply) {
      return res.status(404).json({
        success: false,
        error: 'Resposta rápida não encontrada',
      });
    }

    if (existingReply.createdBy !== req.user?.uid && req.user?.role !== 'admin') {
      throw new ForbiddenError('Você não tem permissão para atualizar esta resposta');
    }

    const reply = await quickReplyService.updateQuickReply(id, updates);

    res.json({
      success: true,
      data: reply,
      message: 'Resposta rápida atualizada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao atualizar resposta rápida:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao atualizar resposta rápida',
    });
  }
};

export const deleteQuickReply = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário é o criador ou admin
    const existingReply = await quickReplyService.getQuickReplyById(id);
    
    if (!existingReply) {
      return res.status(404).json({
        success: false,
        error: 'Resposta rápida não encontrada',
      });
    }

    if (existingReply.createdBy !== req.user?.uid && req.user?.role !== 'admin') {
      throw new ForbiddenError('Você não tem permissão para deletar esta resposta');
    }

    await quickReplyService.deleteQuickReply(id);

    res.json({
      success: true,
      message: 'Resposta rápida deletada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao deletar resposta rápida:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao deletar resposta rápida',
    });
  }
};
