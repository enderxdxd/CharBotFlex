import { Response } from 'express';
import { AuthRequest } from '../types';
import { SettingsService } from '../services/settings.service';
import logger from '../utils/logger';

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
