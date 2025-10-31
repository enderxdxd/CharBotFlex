import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import logger from '../../utils/logger.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// 🔒 CORREÇÃO CRÍTICA: Garantir que crypto está disponível globalmente
if (typeof global.crypto === 'undefined') {
  (global as any).crypto = crypto.webcrypto || crypto;
  logger.info('✅ Polyfill de crypto aplicado globalmente');
}

// Dynamic import types for Baileys
type BaileysModule = typeof import('@whiskeysockets/baileys');
type WASocket = import('@whiskeysockets/baileys').WASocket;
type proto = typeof import('@whiskeysockets/baileys').proto;

export class BaileysService extends EventEmitter {
  private sock: WASocket | null = null;
  private baileys: BaileysModule | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private sessionPath: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // 5 segundos
  
  // 🔒 CORREÇÃO 1: Prevenir múltiplas inicializações simultâneas
  private isInitializing: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || '/data/baileys_sessions';
    logger.info(`📁 Session path: ${this.sessionPath}`);
  }

  async initialize() {
    // 🔒 CORREÇÃO 2: Prevenir inicialização concorrente
    if (this.isInitializing) {
      logger.warn('⚠️  Inicialização já em andamento, ignorando...');
      return;
    }

    // 🔒 Verificar se socket já está conectado
    if (this.isConnected && this.sock) {
      logger.info('✅ Socket já conectado; abortando nova init.');
      this.isInitializing = false;
      return;
    }

    // Limpar timeout de reconexão anterior se existir
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isInitializing = true;

    try {
      logger.info('🔄 Inicializando Baileys...');
      
      // 🔒 Dynamic import of Baileys (ESM module)
      if (!this.baileys) {
        logger.info('📦 Carregando módulo Baileys...');
        this.baileys = await import('@whiskeysockets/baileys');
        logger.info('✅ Módulo Baileys carregado');
      }
      
      // 🔒 CORREÇÃO 3: Desconectar socket anterior antes de criar novo
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.ev.removeAllListeners('messages.upsert');
          this.sock.end(undefined);
          this.sock = null;
          logger.info('Socket anterior encerrado');
        } catch (error) {
          logger.error('Erro ao encerrar socket anterior:', error);
        }
      }
      
      const { state, saveCreds } = await this.baileys.useMultiFileAuthState(
        path.join(this.sessionPath, 'session')
      );

      const { version } = await this.baileys.fetchLatestBaileysVersion();
      logger.info(`📦 Versão do Baileys: ${version.join('.')}`);

      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: true,
        version,
        defaultQueryTimeoutMs: 60000, // 🔧 CORREÇÃO 4: Aumentar timeout
        connectTimeoutMs: 60000, // 60 segundos para conectar
        keepAliveIntervalMs: 30000, // Keep alive a cada 30s
        // 🔧 CORREÇÃO 5: Adicionar configurações de estabilidade
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        getMessage: async () => undefined,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: ['ChatBotFlex', 'Chrome', '1.0.0'],
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
          const err = lastDisconnect?.error as any;
          const statusCode = err?.output?.statusCode;
          const shouldReconnect = statusCode !== this.baileys!.DisconnectReason.loggedOut;

          // Log completo do erro para debug
          logger.error('🔴 Conexão fechada - Detalhes:', {
            statusCode,
            message: err?.message,
            name: err?.name,
            code: err?.code,
            data: err?.data,
            shouldReconnect,
            reconnectAttempts: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts
          });

          // 🔒 CORREÇÃO 6: Marcar inicialização como concluída
          this.isInitializing = false;

          // Se foi logout manual, resetar contador
          if (statusCode === this.baileys!.DisconnectReason.loggedOut) {
            this.reconnectAttempts = 0;
            this.isConnected = false;
            this.emit('disconnected');
            return;
          }

          // 🔧 CORREÇÃO 7: Verificar razões específicas de desconexão
          if (statusCode === 401) {
            logger.error('❌ Sessão inválida. Necessário escanear QR Code novamente.');
            this.isConnected = false;
            this.emit('disconnected');
            return;
          }

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            // 🔒 Prevenir múltiplas reconexões simultâneas
            if (this.reconnecting) {
              logger.warn('⚠️  Reconexão já em andamento, ignorando...');
              return;
            }
            
            this.reconnecting = true;
            this.reconnectAttempts++;
            
            // 🔧 CORREÇÃO 8: Backoff exponencial
            const delay = Math.min(
              this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
              30000 // máximo 30s
            );
            
            logger.warn(`⚠️  Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay}ms`);
            
            // 🔒 Armazenar timeout para poder cancelar
            this.reconnectTimeout = setTimeout(async () => {
              try {
                await this.initialize();
              } finally {
                this.reconnecting = false;
              }
            }, delay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('❌ Limite de tentativas de reconexão atingido. WhatsApp desconectado.');
            logger.info('💡 Para reconectar, acesse a página de WhatsApp e escaneie o QR Code.');
            this.isConnected = false;
            this.reconnectAttempts = 0; // 🔧 CORREÇÃO 9: Reset para próxima tentativa manual
            this.emit('disconnected');
          } else {
            this.isConnected = false;
            this.emit('disconnected');
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qrCode = null;
          this.reconnectAttempts = 0; // Reset contador ao conectar
          this.isInitializing = false; // 🔒 Inicialização concluída com sucesso
          logger.info('✅ Baileys conectado com sucesso!');
          this.emit('connected');
        } else if (connection === 'connecting') {
          logger.info('🔄 Conectando ao WhatsApp...');
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

      // 🔒 CORREÇÃO 10: Marcar inicialização como concluída após setup
      // Apenas se a conexão não foi estabelecida imediatamente
      setTimeout(() => {
        if (!this.isConnected && this.isInitializing) {
          this.isInitializing = false;
          logger.info('⏱️  Timeout de inicialização, marcando como concluída');
        }
      }, 10000); // 10 segundos

    } catch (error) {
      this.isInitializing = false; // 🔒 Liberar flag em caso de erro
      logger.error('Erro ao inicializar Baileys:', error);
      throw error;
    }
  }

  private extractMessageData(message: import('@whiskeysockets/baileys').proto.IWebMessageInfo) {
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

  async downloadMedia(message: import('@whiskeysockets/baileys').proto.IWebMessageInfo) {
    if (!this.sock) {
      throw new Error('Baileys não está conectado');
    }

    try {
      const buffer = await this.baileys!.downloadMediaMessage(
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
    // 🔒 CORREÇÃO 11: Limpar timeouts ao desconectar
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        await this.sock.logout();
      } catch (error) {
        logger.error('Erro ao fazer logout:', error);
      }
      this.sock = null;
      this.isConnected = false;
      this.qrCode = null;
      this.isInitializing = false;
      logger.info('Baileys desconectado');
    }
  }

  async forceNewQR() {
    // 🔒 CORREÇÃO 12: Prevenir múltiplas chamadas simultâneas
    if (this.isInitializing) {
      throw new Error('Já existe uma inicialização em andamento');
    }

    // Limpar timeout anterior se existir
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    // Resetar contador de reconexão
    this.reconnectAttempts = 0;
    
    // Desconectar sessão atual se existir
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        await this.sock.end(undefined);
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
    
    // 🔧 CORREÇÃO 13: Aumentar timeout para 60 segundos
    return new Promise<string>((resolve, reject) => {
      this.qrTimeout = setTimeout(() => {
        this.qrTimeout = null;
        reject(new Error('Timeout ao gerar QR Code'));
      }, 60000); // 60 segundos

      this.once('qr', (qr) => {
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        resolve(qr);
      });

      // 🔧 CORREÇÃO 14: Também resolver se desconectar (erro)
      this.once('disconnected', () => {
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        reject(new Error('Desconectado antes de gerar QR Code'));
      });
    });
  }

  // 🔧 CORREÇÃO 15: Método para limpar recursos
  cleanup() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
    this.removeAllListeners();
  }
}