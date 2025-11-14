import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { db, collections } from '../config/firebase.js';
import logger from '../utils/logger.js';

/**
 * Marcar mensagens como lidas
 */
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    // Buscar mensagens não lidas da conversa
    const messagesSnapshot = await db
      .collection(collections.messages)
      .where('conversationId', '==', conversationId)
      .where('status', 'in', ['sent', 'delivered'])
      .where('from', '!=', userId) // Não marcar próprias mensagens
      .get();

    if (messagesSnapshot.empty) {
      return res.json({
        success: true,
        message: 'Nenhuma mensagem para marcar como lida',
        data: { count: 0 },
      });
    }

    // Atualizar status para 'read'
    const batch = db.batch();
    const readAt = new Date();

    messagesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'read',
        readAt,
      });
    });

    await batch.commit();

    // Atualizar contador de não lidas na conversa
    await db
      .collection(collections.conversations)
      .doc(conversationId)
      .update({
        unreadCount: 0,
      });

    logger.info(`✅ ${messagesSnapshot.size} mensagens marcadas como lidas na conversa ${conversationId}`);

    res.json({
      success: true,
      message: 'Mensagens marcadas como lidas',
      data: {
        count: messagesSnapshot.size,
      },
    });
  } catch (error) {
    logger.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao marcar mensagens como lidas',
    });
  }
};

/**
 * Marcar mensagem específica como lida
 */
export const markMessageAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    const messageRef = db.collection(collections.messages).doc(messageId);
    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Mensagem não encontrada',
      });
    }

    const message = messageDoc.data();

    // Não marcar próprias mensagens como lidas
    if (message?.from === userId) {
      return res.json({
        success: true,
        message: 'Mensagem própria, não marcada',
      });
    }

    await messageRef.update({
      status: 'read',
      readAt: new Date(),
    });

    logger.info(`✅ Mensagem ${messageId} marcada como lida`);

    res.json({
      success: true,
      message: 'Mensagem marcada como lida',
    });
  } catch (error) {
    logger.error('Erro ao marcar mensagem como lida:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao marcar mensagem como lida',
    });
  }
};

/**
 * Obter contagem de mensagens não lidas
 */
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    // Buscar conversas atribuídas ao usuário
    const conversationsSnapshot = await db
      .collection(collections.conversations)
      .where('assignedTo', '==', userId)
      .where('status', '==', 'human')
      .get();

    let totalUnread = 0;
    const unreadByConversation: { [key: string]: number } = {};

    for (const doc of conversationsSnapshot.docs) {
      const conversation = doc.data();
      const unreadCount = conversation.unreadCount || 0;
      totalUnread += unreadCount;
      unreadByConversation[doc.id] = unreadCount;
    }

    res.json({
      success: true,
      data: {
        total: totalUnread,
        byConversation: unreadByConversation,
      },
    });
  } catch (error) {
    logger.error('Erro ao obter contagem de não lidas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter contagem de mensagens não lidas',
    });
  }
};
