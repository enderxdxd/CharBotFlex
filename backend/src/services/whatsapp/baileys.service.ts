import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import logger from '../../utils/logger.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// 🔒 Garantir que crypto está disponível globalmente
if (typeof global.crypto === 'undefined') {
  (global as any).crypto = crypto.webcrypto || crypto;
  logger.info('✅ Polyfill de crypto aplicado globalmente');
}

// Dynamic import types for Baileys
type BaileysModule = typeof import('@whiskeysockets/baileys');
type WASocket = import('@whiskeysockets/baileys').WASocket;

export class BaileysService extends EventEmitter {
  private sock: WASocket | null = null;
  private baileys: BaileysModule | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private sessionPath: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;
  
  // Flags de controle
  private isInitializing: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrTimeout: NodeJS.Timeout | null = null;
  
  // Health check
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastMessageTime: Date = new Date();
  private connectionLostCount: number = 0;

  constructor() {
    super();
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || './baileys_sessions';
    
    // Criar diretório se não existir
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      logger.info(`✅ Diretório de sessão criado: ${this.sessionPath}`);
    }
    
    logger.info(`📁 Session path: ${this.sessionPath}`);
  }

  async initialize(): Promise<void> {
    // Prevenir inicialização concorrente
    if (this.isInitializing) {
      logger.warn('⚠️ Inicialização já em andamento, ignorando...');
      return;
    }

    // Verificar se já está conectado
    if (this.isConnected && this.sock) {
      logger.info('✅ Socket já conectado');
      return;
    }

    // Limpar timeout de reconexão anterior
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isInitializing = true;

    try {
      logger.info('🔄 Inicializando Baileys...');
      
      // Carregar módulo Baileys
      if (!this.baileys) {
        logger.info('📦 Carregando módulo Baileys...');
        this.baileys = await import('@whiskeysockets/baileys');
        logger.info('✅ Módulo Baileys carregado');
      }
      
      // Desconectar socket anterior se existir
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
      
      const sessionDir = path.join(this.sessionPath, 'session');
      
      // Garantir que diretório existe
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      const { state, saveCreds } = await this.baileys.useMultiFileAuthState(sessionDir);

      // =========================================================================
      // CONFIGURAÇÃO QUE FUNCIONA - NÃO MODIFICAR SEM NECESSIDADE
      // =========================================================================
      
      // Obter versão do protocolo
      let version: [number, number, number];
      try {
        const versionInfo = await this.baileys.fetchLatestBaileysVersion();
        version = versionInfo.version as [number, number, number];
        logger.info(`📦 Versão do protocolo: ${version.join('.')}`);
      } catch (e) {
        // Fallback para versão conhecida
        version = [2, 2413, 1];
        logger.warn(`⚠️ Usando versão fallback: ${version.join('.')}`);
      }

      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: true,
        version,
        
        // Timeouts generosos
        defaultQueryTimeoutMs: 120000,
        connectTimeoutMs: 120000,
        qrTimeout: 120000,
        
        // Keep alive
        keepAliveIntervalMs: 25000,
        
        // Retry
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 10,
        
        // CRÍTICO: Manter true para estabilidade
        markOnlineOnConnect: true,
        
        // Não sincronizar histórico
        syncFullHistory: false,
        
        // Browser - usar o padrão do Baileys
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        
        // Outras configs
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
        getMessage: async () => undefined,
      });

      // =========================================================================
      // EVENT HANDLERS
      // =========================================================================

      // Event: Atualização de conexão
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

        logger.info('🔄 Connection Update:', {
          connection,
          isNewLogin,
          isOnline,
          hasQR: !!qr,
          hasDisconnect: !!lastDisconnect
        });

        // QR Code gerado
        if (qr) {
          this.qrCode = await QRCode.toDataURL(qr);
          logger.info('📱 QR Code gerado - Aguardando pareamento...');
          logger.info('⚠️ IMPORTANTE: Escaneie o QR Code UMA VEZ e aguarde conectar');
          this.emit('qr', this.qrCode);
        }

        // Conexão fechada
        if (connection === 'close') {
          await this.handleConnectionClose(lastDisconnect);
        } 
        // Conexão aberta
        else if (connection === 'open') {
          await this.handleConnectionOpen(isNewLogin);
        } 
        // Conectando
        else if (connection === 'connecting') {
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
          this.lastMessageTime = new Date();
          
          logger.info('📨 Nova mensagem:', {
            from: messageData.from,
            type: messageData.type,
            content: messageData.content?.substring(0, 50)
          });
          
          this.emit('message', messageData);
        }
      });

      // Event: Status de mensagem
      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          this.emit('messageUpdate', update);
        }
      });

      // Timeout de segurança
      setTimeout(() => {
        if (!this.isConnected && this.isInitializing) {
          this.isInitializing = false;
          logger.info('⏱️ Timeout de inicialização');
        }
      }, 30000);

    } catch (error) {
      this.isInitializing = false;
      logger.error('❌ Erro ao inicializar Baileys:', error);
      throw error;
    }
  }

  // =========================================================================
  // CONNECTION HANDLERS
  // =========================================================================

  private async handleConnectionClose(lastDisconnect: any): Promise<void> {
    const err = lastDisconnect?.error as any;
    const statusCode = err?.output?.statusCode;
    const errorMessage = err?.message || '';
    
    logger.warn('🔴 Conexão fechada:', {
      statusCode,
      message: errorMessage,
      reconnectAttempts: this.reconnectAttempts
    });

    this.isInitializing = false;
    this.isConnected = false;

    // Verificar se é erro "can't link devices" (428)
    if (statusCode === 428 || errorMessage.toLowerCase().includes("can't link")) {
      logger.error('🚫 Erro 428: WhatsApp bloqueou temporariamente');
      logger.error('💡 Isso pode acontecer por:');
      logger.error('   1. Muitas tentativas de conexão');
      logger.error('   2. QR Code escaneado múltiplas vezes');
      logger.error('   3. Sessão anterior não foi limpa corretamente');
      logger.error('💡 Solução: Aguarde 5-10 minutos e tente novamente');
      
      this.emit('error', { 
        code: 'CANT_LINK_DEVICES', 
        message: "can't link devices - Aguarde alguns minutos" 
      });
      return;
    }

    // Verificar se foi logout
    if (statusCode === this.baileys!.DisconnectReason.loggedOut) {
      logger.warn('⚠️ Usuário fez logout');
      this.emit('disconnected');
      return;
    }

    // Tentar reconectar
    const shouldReconnect = statusCode !== this.baileys!.DisconnectReason.loggedOut;
    
    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      if (this.reconnecting) {
        logger.warn('⚠️ Reconexão já em andamento');
        return;
      }
      
      this.reconnecting = true;
      this.reconnectAttempts++;
      
      const delay = Math.min(
        this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
        30000
      );
      
      logger.warn(`🔄 Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${delay}ms...`);
      
      this.reconnectTimeout = setTimeout(async () => {
        try {
          await this.initialize();
        } finally {
          this.reconnecting = false;
        }
      }, delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Limite de reconexões atingido');
      this.reconnectAttempts = 0;
      this.emit('disconnected');
    } else {
      this.emit('disconnected');
    }
  }

  private async handleConnectionOpen(isNewLogin: boolean | undefined): Promise<void> {
    this.isConnected = true;
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.lastMessageTime = new Date();
    this.connectionLostCount = 0;
    
    if (isNewLogin) {
      logger.info('✅ WhatsApp conectado! (NOVO LOGIN)');
      logger.info('📱 Dispositivo pareado com sucesso');
    } else {
      logger.info('✅ WhatsApp conectado! (SESSÃO RESTAURADA)');
      logger.info('🎉 Não é necessário escanear QR Code novamente!');
    }
    
    this.emit('connected');
    this.startHealthCheck();
  }

  // =========================================================================
  // MESSAGE HANDLING
  // =========================================================================

  private extractMessageData(message: any) {
    const remoteJid = message.key.remoteJid || '';
    const messageType = Object.keys(message.message || {})[0];
    
    let content = '';

    if (message.message?.conversation) {
      content = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
      content = message.message.extendedTextMessage.text;
    } else if (message.message?.imageMessage?.caption) {
      content = message.message.imageMessage.caption;
    }

    const contactName = message.pushName || 
                       message.verifiedBizName || 
                       remoteJid.split('@')[0];

    return {
      id: message.key.id,
      from: remoteJid,
      fromMe: message.key.fromMe || false,
      contactName,
      type: this.mapMessageType(messageType),
      content,
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

  // =========================================================================
  // SEND MESSAGES
  // =========================================================================

  async sendTextMessage(phoneNumber: string, text: string): Promise<void> {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      logger.info(`📤 Enviando mensagem para ${jid}`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada para ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string,
    type: 'image' | 'video' | 'audio' | 'document' = 'image'
  ): Promise<void> {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não está conectado');
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
      logger.error('❌ Erro ao enviar mídia:', error);
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length < 10) {
      cleaned = '55' + cleaned;
    }
    
    return `${cleaned}@s.whatsapp.net`;
  }

  // =========================================================================
  // HEALTH CHECK
  // =========================================================================

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('🏥 Iniciando monitoramento de saúde');

    this.healthCheckInterval = setInterval(async () => {
      const minutesSinceLastMessage = Math.floor(
        (Date.now() - this.lastMessageTime.getTime()) / 60000
      );

      logger.debug(`🏥 Health: ${this.isConnected ? 'OK' : 'OFFLINE'} | Última atividade: ${minutesSinceLastMessage}min`);

      // Se passou mais de 10 minutos sem atividade, fazer ping
      if (this.isConnected && minutesSinceLastMessage > 10 && this.sock) {
        try {
          await this.sock.sendPresenceUpdate('available');
          this.lastMessageTime = new Date();
        } catch (error) {
          logger.warn('⚠️ Erro no ping de presença:', error);
          this.connectionLostCount++;
          
          if (this.connectionLostCount >= 3) {
            logger.error('❌ Conexão perdida! Reconectando...');
            this.isConnected = false;
            this.connectionLostCount = 0;
            this.initialize().catch(err => logger.error('Erro ao reconectar:', err));
          }
        }
      }
    }, 30000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // =========================================================================
  // PUBLIC METHODS
  // =========================================================================

  getQRCode(): string | null {
    return this.qrCode;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
    
    this.stopHealthCheck();

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
      logger.info('✅ WhatsApp desconectado');
    }
  }

  async forceNewQR(): Promise<string> {
    logger.info('🔄 Gerando novo QR Code...');
    
    if (this.isInitializing) {
      logger.warn('⚠️ Inicialização em andamento, aguardando...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (this.qrCode) {
        return this.qrCode;
      }
    }

    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }

    this.reconnectAttempts = 0;
    
    // Desconectar sessão atual
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        await this.sock.end(undefined);
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        logger.info('✅ Sessão anterior desconectada');
      } catch (error) {
        logger.error('Erro ao desconectar:', error);
      }
    }

    // Limpar sessão salva
    const sessionDir = path.join(this.sessionPath, 'session');
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão anterior removida');
      } catch (error) {
        logger.error('Erro ao remover sessão:', error);
      }
    }

    // Aguardar um pouco antes de reiniciar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reinicializar
    await this.initialize();
    
    // Aguardar QR Code
    return new Promise<string>((resolve, reject) => {
      this.qrTimeout = setTimeout(() => {
        this.qrTimeout = null;
        reject(new Error('Timeout ao gerar QR Code'));
      }, 120000);

      this.once('qr', (qr) => {
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        logger.info('✅ QR Code gerado!');
        resolve(qr);
      });

      this.once('disconnected', () => {
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        reject(new Error('Desconectado antes de gerar QR'));
      });
      
      this.once('error', (err) => {
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        reject(new Error(err.message || 'Erro ao gerar QR'));
      });
    });
  }

  cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
    this.stopHealthCheck();
    this.removeAllListeners();
  }
}