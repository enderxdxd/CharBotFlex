import { Request, Response } from 'express';
import { ConversationService } from '../services/conversation.service';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

const conversationService = new ConversationService();

/**
 * Buscar todas as conversas (com filtro por operador)
 */
export const getAllConversations = async (req: Request, res: Response) => {
  try {
    const { status, assignedTo, departmentId } = req.query;
    const userId = (req as any).user?.uid;
    const userRole = (req as any).user?.role;

    // Se não for admin, forçar filtro por assignedTo
    const filters: any = {
      status: status as string,
      assignedTo: assignedTo as string,
      departmentId: departmentId as string,
    };

    if (userRole !== 'admin' && userId) {
      filters.assignedTo = userId;
      logger.info(`🔒 Operador ${userId} - Filtrando apenas conversas atribuídas`);
    }

    const conversations = await conversationService.getAllConversations(filters);

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error: any) {
    logger.error('Erro ao buscar conversas:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar conversas',
    });
  }
};

/**
 * Buscar conversa por ID
 */
export const getConversationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conversation = await conversationService.getConversationById(id);

    if (!conversation) {
      throw new AppError('Conversa não encontrada', 404);
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error: any) {
    logger.error('Erro ao buscar conversa:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao buscar conversa',
    });
  }
};

/**
 * Buscar mensagens de uma conversa
 */
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const messages = await conversationService.getConversationMessages(id);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    logger.error('Erro ao buscar mensagens:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar mensagens',
    });
  }
};

/**
 * Enviar mensagem em uma conversa
 */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, type } = req.body;
    const userId = (req as any).user?.uid;

    if (!content) {
      throw new AppError('Conteúdo da mensagem é obrigatório', 400);
    }

    const message = await conversationService.sendMessage(id, userId, {
      content,
      type: type || 'text',
      isFromBot: true, // ✅ Mensagem do atendente = sistema (azul, direita)
    });

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Erro ao enviar mensagem:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao enviar mensagem',
    });
  }
};

/**
 * Fechar conversa manualmente
 */
export const closeConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, note } = req.body;
    const userId = (req as any).user?.uid;

    const conversation = await conversationService.closeConversation(id, userId, {
      reason: reason || 'manual',
      note,
    });

    res.json({
      success: true,
      data: conversation,
      message: 'Conversa encerrada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao fechar conversa:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao fechar conversa',
    });
  }
};

/**
 * Transferir conversa para operador com observação
 */
export const transferConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { operatorId, note } = req.body;
    const userId = (req as any).user?.uid;

    if (!operatorId) {
      return res.status(400).json({
        success: false,
        error: 'ID do operador é obrigatório',
      });
    }

    const conversation = await conversationService.transferConversation(
      id,
      operatorId,
      userId || '',
      note
    );

    res.json({
      success: true,
      data: conversation,
      message: 'Conversa transferida com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao transferir conversa:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao transferir conversa',
    });
  }
};

/**
 * Reabrir conversa
 */
export const reopenConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.uid;

    const conversation = await conversationService.reopenConversation(id, userId);

    res.json({
      success: true,
      data: conversation,
      message: 'Conversa reaberta com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao reabrir conversa:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao reabrir conversa',
    });
  }
};

/**
 * Atribuir conversa a um operador
 */
export const assignConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { operatorId, operatorName } = req.body;

    if (!operatorId || !operatorName) {
      throw new AppError('ID e nome do operador são obrigatórios', 400);
    }

    const conversation = await conversationService.assignConversation(
      id,
      operatorId,
      operatorName
    );

    res.json({
      success: true,
      data: conversation,
      message: 'Conversa atribuída com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao atribuir conversa:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Erro ao atribuir conversa',
    });
  }
};

/**
 * Marcar mensagens como lidas
 */
export const markMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await conversationService.markMessagesAsRead(id);

    res.json({
      success: true,
      message: 'Mensagens marcadas como lidas',
    });
  } catch (error: any) {
    logger.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao marcar mensagens como lidas',
    });
  }
};
