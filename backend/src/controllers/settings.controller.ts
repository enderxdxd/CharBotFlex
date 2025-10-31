import { Response } from 'express';
import { AuthRequest } from '../types.js';
import { SettingsService } from '../services/settings.service.js';
import { runManualCheck } from '../jobs/conversation-auto-close.job.js';
import logger from '../utils/logger.js';

const settingsService = new SettingsService();

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await settingsService.getSettings();
    
    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Erro ao buscar configurações:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar configurações',
    });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid || 'unknown';
    const updateData = req.body;
    
    await settingsService.updateSettings(updateData, userId);
    
    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar configurações:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar configurações',
    });
  }
};

export const updateMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid || 'unknown';
    const messages = req.body;
    
    await settingsService.updateMessages(messages, userId);
    
    res.json({
      success: true,
      message: 'Mensagens atualizadas com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar mensagens',
    });
  }
};

export const resetMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid || 'unknown';
    
    await settingsService.resetToDefaults(userId);
    
    res.json({
      success: true,
      message: 'Mensagens resetadas para padrão',
    });
  } catch (error) {
    logger.error('Erro ao resetar mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao resetar mensagens',
    });
  }
};

export const runAutoCloseCheck = async (req: AuthRequest, res: Response) => {
  try {
    // Verificar se o usuário tem permissão (apenas admin)
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem executar esta ação',
      });
    }

    logger.info(`🔧 Verificação manual iniciada por ${req.user.name}`);
    
    // Executar verificação em background
    runManualCheck().catch(error => {
      logger.error('Erro na verificação manual:', error);
    });
    
    res.json({
      success: true,
      message: 'Verificação de conversas inativas iniciada',
    });
  } catch (error) {
    logger.error('Erro ao iniciar verificação manual:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao iniciar verificação manual',
    });
  }
};
