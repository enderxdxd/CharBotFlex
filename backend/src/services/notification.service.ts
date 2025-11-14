import { db, collections } from '../config/firebase.js';
import logger from '../utils/logger.js';
import webpush from 'web-push';

// Configurar Web Push (você precisa gerar as chaves VAPID)
// Execute: npx web-push generate-vapid-keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@charbotflex.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  logger.info('✅ Web Push configurado');
} else {
  logger.warn('⚠️ Web Push não configurado - defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY');
}

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

export class NotificationService {
  /**
   * Salvar subscription de push notification
   */
  async saveSubscription(userId: string, subscription: any): Promise<void> {
    try {
      const subscriptionData: PushSubscription = {
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: subscription.userAgent,
        createdAt: new Date(),
      };

      await db
        .collection('push_subscriptions')
        .doc(userId)
        .set(subscriptionData);

      logger.info(`✅ Push subscription salva para usuário: ${userId}`);
    } catch (error) {
      logger.error('Erro ao salvar push subscription:', error);
      throw error;
    }
  }

  /**
   * Remover subscription
   */
  async removeSubscription(userId: string): Promise<void> {
    try {
      await db.collection('push_subscriptions').doc(userId).delete();
      logger.info(`🗑️ Push subscription removida para usuário: ${userId}`);
    } catch (error) {
      logger.error('Erro ao remover push subscription:', error);
      throw error;
    }
  }

  /**
   * Enviar notificação push para um usuário
   */
  async sendPushNotification(
    userId: string,
    notification: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: any;
      tag?: string;
      requireInteraction?: boolean;
    }
  ): Promise<void> {
    try {
      // Buscar subscription do usuário
      const subscriptionDoc = await db
        .collection('push_subscriptions')
        .doc(userId)
        .get();

      if (!subscriptionDoc.exists) {
        logger.warn(`⚠️ Nenhuma subscription encontrada para usuário: ${userId}`);
        return;
      }

      const subscriptionData = subscriptionDoc.data() as PushSubscription;

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192x192.png',
        badge: notification.badge || '/badge-72x72.png',
        data: notification.data || {},
        tag: notification.tag,
        requireInteraction: notification.requireInteraction || false,
      });

      await webpush.sendNotification(
        {
          endpoint: subscriptionData.endpoint,
          keys: subscriptionData.keys,
        },
        payload
      );

      logger.info(`✅ Push notification enviada para usuário: ${userId}`);
    } catch (error: any) {
      logger.error('Erro ao enviar push notification:', error);

      // Se subscription expirou ou é inválida, remover
      if (error.statusCode === 410 || error.statusCode === 404) {
        logger.warn(`🗑️ Subscription inválida, removendo para usuário: ${userId}`);
        await this.removeSubscription(userId);
      }
    }
  }

  /**
   * Notificar nova mensagem
   */
  async notifyNewMessage(
    operatorId: string,
    conversationId: string,
    customerName: string,
    messagePreview: string
  ): Promise<void> {
    await this.sendPushNotification(operatorId, {
      title: `Nova mensagem de ${customerName}`,
      body: messagePreview,
      icon: '/icon-192x192.png',
      tag: `conversation-${conversationId}`,
      data: {
        type: 'new_message',
        conversationId,
        url: `/chats?conversation=${conversationId}`,
      },
      requireInteraction: true,
    });
  }

  /**
   * Notificar transferência de conversa
   */
  async notifyTransfer(
    operatorId: string,
    conversationId: string,
    customerName: string,
    fromOperator: string
  ): Promise<void> {
    await this.sendPushNotification(operatorId, {
      title: 'Conversa transferida para você',
      body: `${fromOperator} transferiu a conversa com ${customerName}`,
      icon: '/icon-192x192.png',
      tag: `transfer-${conversationId}`,
      data: {
        type: 'transfer',
        conversationId,
        url: `/chats?conversation=${conversationId}`,
      },
      requireInteraction: true,
    });
  }

  /**
   * Notificar nova conversa na fila
   */
  async notifyQueuedConversation(
    operatorId: string,
    conversationId: string,
    customerName: string
  ): Promise<void> {
    await this.sendPushNotification(operatorId, {
      title: 'Nova conversa na fila',
      body: `${customerName} está aguardando atendimento`,
      icon: '/icon-192x192.png',
      tag: `queue-${conversationId}`,
      data: {
        type: 'queued',
        conversationId,
        url: `/chats`,
      },
    });
  }
}

export const notificationService = new NotificationService();
