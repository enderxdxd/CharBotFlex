import { Response } from 'express';
import { AuthRequest } from '../types';
import { TagService } from '../services/tag.service';
import logger from '../utils/logger';
import { ForbiddenError } from '../utils/AppError';

const tagService = new TagService();

export const getAllTags = async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;
    
    const tags = await tagService.getAllTags({
      category: category as string,
    });

    res.json({
      success: true,
      data: tags,
    });
  } catch (error) {
    logger.error('Erro ao buscar tags:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar tags',
    });
  }
};

export const getTagById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const tag = await tagService.getTagById(id);

    if (!tag) {
      return res.status(404).json({
        success: false,
        error: 'Tag não encontrada',
      });
    }

    res.json({
      success: true,
      data: tag,
    });
  } catch (error) {
    logger.error('Erro ao buscar tag:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar tag',
    });
  }
};

export const createTag = async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, category } = req.body;

    // Verificar se o usuário tem permissão
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      throw new ForbiddenError('Apenas administradores e supervisores podem criar tags');
    }

    const tag = await tagService.createTag(
      { name, color, category },
      req.user!.uid
    );

    res.status(201).json({
      success: true,
      data: tag,
      message: 'Tag criada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao criar tag:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao criar tag',
    });
  }
};

export const updateTag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verificar permissões
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      throw new ForbiddenError('Apenas administradores e supervisores podem atualizar tags');
    }

    const tag = await tagService.updateTag(id, updates);

    res.json({
      success: true,
      data: tag,
      message: 'Tag atualizada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao atualizar tag:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao atualizar tag',
    });
  }
};

export const deleteTag = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário é admin
    if (req.user?.role !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem deletar tags');
    }

    await tagService.deleteTag(id);

    res.json({
      success: true,
      message: 'Tag deletada com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao deletar tag:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao deletar tag',
    });
  }
};

export const addTagToConversation = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, tagId } = req.body;

    await tagService.addTagToConversation(conversationId, tagId);

    res.json({
      success: true,
      message: 'Tag adicionada à conversa',
    });
  } catch (error: any) {
    logger.error('Erro ao adicionar tag:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao adicionar tag',
    });
  }
};

export const removeTagFromConversation = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, tagId } = req.params;

    await tagService.removeTagFromConversation(conversationId, tagId);

    res.json({
      success: true,
      message: 'Tag removida da conversa',
    });
  } catch (error: any) {
    logger.error('Erro ao remover tag:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Erro ao remover tag',
    });
  }
};
