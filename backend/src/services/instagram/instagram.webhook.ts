import { Request, Response } from 'express';
import { db, collections } from '../../config/firebase.js';
import logger from '../../utils/logger.js';
import instagramClient from './instagram.client.js';
import { InstagramMessageHandler } from './instagram.handler.js';
import {
  IInstagramWebhookEvent,
  IInstagramMessagingEvent,
} from '../../types/index.js';

export class InstagramWebhook {
  private messageHandler: InstagramMessageHandler;

  constructor() {
    this.messageHandler = new InstagramMessageHandler();
  }

  /**
   * Verifica o webhook (GET request do Facebook)
   * Facebook envia: hub.mode, hub.verify_token, hub.challenge
   */
  async verifyWebhook(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('📸 Verificação de webhook Instagram recebida:', { mode, token: token ? '***' : 'missing' });

    // Carregar configuração para obter o verify token
    const config = await instagramClient.loadConfig();
    
    if (!config) {
      logger.error('❌ Configuração do Instagram não encontrada');
      res.status(403).send('Configuration not found');
      return;
    }

    if (mode === 'subscribe' && token === config.webhookVerifyToken) {
      logger.info('✅ Webhook do Instagram verificado com sucesso!');
      res.status(200).send(challenge);
    } else {
      logger.error('❌ Falha na verificação do webhook - token inválido');
      res.status(403).send('Verification failed');
    }
  }

  /**
   * Processa eventos do webhook (POST request do Facebook)
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    // Responder imediatamente com 200 para evitar timeout
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body as IInstagramWebhookEvent;

      // Verificar se é um evento do Instagram
      if (body.object !== 'instagram') {
        logger.warn('⚠️ Evento não é do Instagram:', body.object);
        return;
      }

      logger.info('📸 Webhook Instagram recebido:', JSON.stringify(body, null, 2));

      // Processar cada entry
      for (const entry of body.entry) {
        const pageId = entry.id;

        // Processar cada evento de mensagem
        for (const event of entry.messaging) {
          await this.processMessagingEvent(pageId, event);
        }
      }
    } catch (error) {
      logger.error('❌ Erro ao processar webhook Instagram:', error);
    }
  }

  /**
   * Processa um evento de mensagem individual
   */
  private async processMessagingEvent(pageId: string, event: IInstagramMessagingEvent): Promise<void> {
    try {
      const senderId = event.sender.id;
      const recipientId = event.recipient.id;
      const timestamp = event.timestamp;

      // Ignorar mensagens enviadas pela própria página (echo)
      if (event.message?.is_echo) {
        logger.debug('⏭️ Ignorando echo de mensagem enviada pela página');
        return;
      }

      // Processar mensagem de texto ou mídia
      if (event.message) {
        const messageId = event.message.mid;
        const text = event.message.text;
        const attachments = event.message.attachments;

        logger.info(`📸 Mensagem recebida do Instagram:`, {
          senderId,
          messageId,
          text: text?.substring(0, 50),
          hasAttachments: !!attachments,
        });

        // Marcar como visto
        await instagramClient.markAsSeen(senderId);

        // Processar a mensagem
        await this.messageHandler.handleIncomingMessage({
          messageId,
          senderId,
          pageId,
          text,
          attachments,
          timestamp,
        });
      }

      // Processar postback (clique em botão)
      if (event.postback) {
        logger.info(`📸 Postback recebido do Instagram:`, {
          senderId,
          title: event.postback.title,
          payload: event.postback.payload,
        });

        await this.messageHandler.handleIncomingMessage({
          messageId: event.postback.mid,
          senderId,
          pageId,
          text: event.postback.payload, // Usar payload como texto
          timestamp,
          isPostback: true,
        });
      }

      // Processar evento de leitura
      if (event.read) {
        logger.debug(`📸 Mensagens lidas até: ${event.read.watermark}`);
        // Pode ser usado para atualizar status de mensagens
      }
    } catch (error) {
      logger.error('❌ Erro ao processar evento de mensagem:', error);
    }
  }
}

export default new InstagramWebhook();
