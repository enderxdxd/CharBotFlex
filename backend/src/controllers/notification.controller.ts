import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { notificationService } from '../services/notification.service.js';
import logger from '../utils/logger.js';

/**
 * Salvar subscription de push notification
 */
export const subscribe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;
    const { subscription } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Subscription inválida',
      });
    }

    await notificationService.saveSubscription(userId, subscription);

    res.json({
      success: true,
      message: 'Notificações ativadas com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao salvar subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao ativar notificações',
    });
  }
};

/**
 * Remover subscription
 */
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    await notificationService.removeSubscription(userId);

    res.json({
      success: true,
      message: 'Notificações desativadas com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao remover subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao desativar notificações',
    });
  }
};

/**
 * Obter chave pública VAPID
 */
export const getVapidPublicKey = async (req: AuthRequest, res: Response) => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';

    if (!publicKey) {
      return res.status(503).json({
        success: false,
        error: 'Notificações push não configuradas',
      });
    }

    res.json({
      success: true,
      data: {
        publicKey,
      },
    });
  } catch (error) {
    logger.error('Erro ao obter chave VAPID:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter configurações de notificação',
    });
  }
};

/**
 * Testar notificação
 */
export const testNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    await notificationService.sendPushNotification(userId, {
      title: 'Notificação de Teste',
      body: 'As notificações estão funcionando! 🎉',
      icon: '/icon-192x192.png',
      data: {
        type: 'test',
        url: '/chats',
      },
    });

    res.json({
      success: true,
      message: 'Notificação de teste enviada',
    });
  } catch (error) {
    logger.error('Erro ao enviar notificação de teste:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar notificação de teste',
    });
  }
};
