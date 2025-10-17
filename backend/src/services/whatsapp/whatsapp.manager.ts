import { BaileysService } from './baileys.service';
import { OfficialApiService } from './official-api.service';
import { MessageHandler } from '../bot/message.handler';
import logger from '../../utils/logger';

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
        logger.info('Baileys conectado com sucesso');
      });

      this.baileysService.on('disconnected', () => {
        logger.warn('Baileys desconectado');
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
}

// Singleton instance
let whatsappManager: WhatsAppManager | null = null;

export const getWhatsAppManager = (): WhatsAppManager => {
  if (!whatsappManager) {
    whatsappManager = new WhatsAppManager();
  }
  return whatsappManager;
};
