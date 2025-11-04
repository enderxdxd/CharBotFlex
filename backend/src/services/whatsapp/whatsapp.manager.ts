import { BaileysService } from './baileys.service.js';
import { OfficialApiService } from './official-api.service.js';
import { MessageHandler } from '../bot/message.handler.js';
import logger from '../../utils/logger.js';

export class WhatsAppManager {
  private baileysService: BaileysService;
  private officialApiService: OfficialApiService;
  private messageHandler: MessageHandler;
  private currentProvider: 'baileys' | 'official' = 'baileys';

  constructor() {
    this.baileysService = new BaileysService();
    this.officialApiService = new OfficialApiService();
    this.messageHandler = new MessageHandler(this);
  }

  async initialize() {
    const provider = process.env.WHATSAPP_PROVIDER || 'baileys';
    this.currentProvider = provider as 'baileys' | 'official';

    if (this.currentProvider === 'baileys') {
      await this.baileysService.initialize();
      
      // Configurar eventos do Baileys
      this.baileysService.on('message', (message) => {
        this.messageHandler.handleIncomingMessage(message, 'baileys');
      });

      this.baileysService.on('connected', () => {
        logger.info('✅ Baileys conectado com sucesso');
        // Emitir evento via Socket.IO para notificar frontend
        const io = require('../server.js').io;
        if (io) {
          io.emit('whatsapp:connected', { 
            provider: 'baileys',
            timestamp: new Date() 
          });
          logger.info('📡 Evento whatsapp:connected emitido para frontend');
        }
      });

      this.baileysService.on('disconnected', () => {
        logger.warn('⚠️ Baileys desconectado');
        // Emitir evento via Socket.IO para notificar frontend
        const io = require('../server.js').io;
        if (io) {
          io.emit('whatsapp:disconnected', { 
            provider: 'baileys',
            timestamp: new Date() 
          });
          logger.info('📡 Evento whatsapp:disconnected emitido para frontend');
        }
      });

      this.baileysService.on('qr', (qrCode) => {
        logger.info('📱 QR Code gerado, emitindo para frontend...');
        // Emitir evento via Socket.IO para atualizar QR code em tempo real
        const io = require('../server.js').io;
        if (io) {
          io.emit('whatsapp:qr', { 
            qrCode,
            timestamp: new Date() 
          });
          logger.info('📡 Evento whatsapp:qr emitido para frontend');
        }
      });
    }

    logger.info(`🔗 WhatsApp Manager inicializado com provider: ${this.currentProvider}`);
  }

  async sendMessage(phoneNumber: string, message: string) {
    try {
      if (this.currentProvider === 'baileys') {
        return await this.baileysService.sendTextMessage(phoneNumber, message);
      } else {
        return await this.officialApiService.sendMessage(phoneNumber, message);
      }
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string,
    type: 'image' | 'video' | 'audio' | 'document' = 'image'
  ) {
    try {
      if (this.currentProvider === 'baileys') {
        return await this.baileysService.sendMediaMessage(phoneNumber, mediaUrl, caption, type);
      } else {
        return await this.officialApiService.sendMediaMessage(phoneNumber, mediaUrl, caption, type);
      }
    } catch (error) {
      logger.error('Erro ao enviar mídia:', error);
      throw error;
    }
  }

  async sendTemplate(to: string, templateName: string, parameters: any[]) {
    if (this.currentProvider === 'official') {
      return await this.officialApiService.sendTemplate(to, templateName, parameters);
    } else {
      throw new Error('Templates só são suportados na API oficial');
    }
  }

  isBaileysReady(): boolean {
    return this.baileysService.isReady();
  }

  getBaileysQRCode(): string | null {
    return this.baileysService.getQRCode();
  }

  getConnectionStatus() {
    if (this.currentProvider === 'baileys') {
      return this.baileysService.isReady();
    }
    return true; // API oficial sempre "conectada" se configurada
  }

  getCurrentProvider() {
    return this.currentProvider;
  }

  switchProvider(provider: 'baileys' | 'official') {
    this.currentProvider = provider;
    logger.info(`🔄 Provider alterado para: ${provider}`);
  }

  async generateNewQR(): Promise<string> {
    if (this.currentProvider === 'baileys') {
      return await this.baileysService.forceNewQR();
    } else {
      throw new Error('QR Code só disponível para Baileys');
    }
  }

  async disconnect() {
    if (this.currentProvider === 'baileys') {
      await this.baileysService.disconnect();
      logger.info('✅ Baileys desconectado');
    }
  }

  getBaileysService() {
    return this.baileysService;
  }
}

// Singleton instance
let whatsappManager: WhatsAppManager | null = null;

export const getWhatsAppManager = (): WhatsAppManager => {
  if (!whatsappManager) {
    whatsappManager = new WhatsAppManager();
  }
  return whatsappManager;
};
