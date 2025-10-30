import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import logger from '../../utils/logger';
import { EventEmitter } from 'events';

export class BaileysService extends EventEmitter {
  private sock: WASocket | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private sessionPath: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 segundos

  constructor() {
    super();
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || './baileys_sessions';
  }

  async initialize() {
    try {
      logger.info('🔄 Inicializando Baileys...');
      
      const { state, saveCreds } = await useMultiFileAuthState(
        path.join(this.sessionPath, 'session')
      );

      const { version } = await fetchLatestBaileysVersion();
      logger.info(`📦 Versão do Baileys: ${version.join('.')}`);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        version,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 60000, // 60 segundos para conectar
        keepAliveIntervalMs: 30000, // Keep alive a cada 30s
      });

      // Event: Atualização de conexão
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = await QRCode.toDataURL(qr);
          logger.info('📱 QR Code gerado');
          this.emit('qr', this.qrCode);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          logger.info(`Conexão fechada. Status: ${statusCode}, Reconectar: ${shouldReconnect}`);

          // Se foi logout manual, resetar contador
          if (statusCode === DisconnectReason.loggedOut) {
            this.reconnectAttempts = 0;
            this.isConnected = false;
            this.emit('disconnected');
            return;
          }

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            logger.warn(`⚠️  Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(async () => {
              await this.initialize();
            }, this.reconnectDelay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('❌ Limite de tentativas de reconexão atingido. WhatsApp desconectado.');
            logger.info('💡 Para reconectar, acesse a página de WhatsApp e escaneie o QR Code.');
            this.isConnected = false;
            this.emit('disconnected');
          } else {
            this.isConnected = false;
            this.emit('disconnected');
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qrCode = null;
          this.reconnectAttempts = 0; // Reset contador ao conectar
          logger.info('✅ Baileys conectado com sucesso!');
          this.emit('connected');
        }
      });

      // Event: Atualização de credenciais
      this.sock.ev.on('creds.update', saveCreds);

      // Event: Mensagens recebidas
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const message of messages) {
          if (!message.message) continue;

          const messageData = this.extractMessageData(message);
          
          logger.info('📨 Nova mensagem Baileys:', messageData);
          
          this.emit('message', messageData);
        }
      });

      // Event: Status de mensagem atualizado
      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          this.emit('messageUpdate', update);
        }
      });
    } catch (error) {
      logger.error('Erro ao inicializar Baileys:', error);
      throw error;
    }
  }

  private extractMessageData(message: proto.IWebMessageInfo) {
    const remoteJid = message.key.remoteJid || '';
    const messageType = Object.keys(message.message || {})[0];
    
    let content = '';
    let mediaUrl = undefined;

    // Extrair conteúdo baseado no tipo
    if (message.message?.conversation) {
      content = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
      content = message.message.extendedTextMessage.text;
    } else if (message.message?.imageMessage?.caption) {
      content = message.message.imageMessage.caption;
    }

    // Extrair nome do contato (pushName ou notifyName)
    const contactName = message.pushName || 
                       message.verifiedBizName || 
                       remoteJid.split('@')[0]; // fallback para o número

    return {
      id: message.key.id,
      from: remoteJid,
      fromMe: message.key.fromMe || false,
      contactName, // Nome do contato do WhatsApp
      type: this.mapMessageType(messageType),
      content,
      mediaUrl,
      timestamp: message.messageTimestamp
        ? new Date(Number(message.messageTimestamp) * 1000)
        : new Date(),
      raw: message,
    };
  }

  private mapMessageType(type: string): string {
    const typeMap: Record<string, string> = {
      conversation: 'text',
      extendedTextMessage: 'text',
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
      documentMessage: 'document',
    };

    return typeMap[type] || 'text';
  }

  async sendTextMessage(phoneNumber: string, text: string) {
    if (!this.sock) {
      throw new Error('Baileys não está conectado');
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📤 Enviando mensagem para ${phoneNumber} (JID: ${jid})`);
      logger.info(`📝 Conteúdo: ${text}`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada com sucesso para ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Erro ao enviar mensagem para ${phoneNumber}:`, error);
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string,
    type: 'image' | 'video' | 'audio' | 'document' = 'image'
  ) {
    if (!this.sock) {
      throw new Error('Baileys não está conectado');
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      const message: any = {
        [type]: { url: mediaUrl },
      };

      if (caption) {
        message[type].caption = caption;
      }

      await this.sock.sendMessage(jid, message);
      
      logger.info(`✅ Mídia ${type} enviada para ${phoneNumber}`);
    } catch (error) {
      logger.error('Erro ao enviar mídia:', error);
      throw error;
    }
  }

  async downloadMedia(message: proto.IWebMessageInfo) {
    if (!this.sock) {
      throw new Error('Baileys não está conectado');
    }

    try {
      const buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          logger: logger as any,
          reuploadRequest: this.sock.updateMediaMessage,
        }
      );

      return buffer;
    } catch (error) {
      logger.error('Erro ao baixar mídia:', error);
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');
    
    // Se já tem código do país (começa com 1, 55, etc), usar como está
    // Números internacionais geralmente têm 10+ dígitos
    // Se tiver menos de 10 dígitos, assumir que falta o código do país (Brasil = 55)
    if (cleaned.length < 10) {
      cleaned = '55' + cleaned;
    }
    
    // Adiciona @s.whatsapp.net
    return `${cleaned}@s.whatsapp.net`;
  }

  getQRCode(): string | null {
    return this.qrCode;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
      this.isConnected = false;
      this.qrCode = null;
      logger.info('Baileys desconectado');
    }
  }

  async forceNewQR() {
    // Resetar contador de reconexão
    this.reconnectAttempts = 0;
    
    // Desconectar sessão atual se existir
    if (this.sock) {
      try {
        await this.sock.logout();
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        logger.info('Sessão anterior desconectada');
      } catch (error) {
        logger.error('Erro ao desconectar sessão:', error);
      }
    }

    // Limpar sessão salva
    const fs = require('fs');
    const sessionDir = path.join(this.sessionPath, 'session');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info('Sessão anterior removida');
    }

    // Reinicializar para gerar novo QR Code
    await this.initialize();
    
    // Aguardar QR Code ser gerado
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao gerar QR Code'));
      }, 30000); // 30 segundos

      this.once('qr', (qr) => {
        clearTimeout(timeout);
        resolve(qr);
      });
    });
  }
}