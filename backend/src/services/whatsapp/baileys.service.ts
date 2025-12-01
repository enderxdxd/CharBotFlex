import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
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
  
  // 🔒 CORREÇÃO: Prevenir múltiplas inicializações simultâneas
  private isInitializing: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrTimeout: NodeJS.Timeout | null = null;
  
  // 🔧 Monitoramento de saúde da conexão
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastMessageTime: Date = new Date();
  private connectionLostCount: number = 0;
  
  // 🔧 Keep-alive periódico
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastKeepAlive: Date = new Date();
  
  // 🔧 NOVO: Cache de estado do WebSocket
  private lastWSState: number = -1;

  constructor() {
    super();
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || '/data/baileys_sessions';
    logger.info(`📁 Session path: ${this.sessionPath}`);
    
    // 🔧 NOVO: Garantir que o diretório de sessão existe
    this.ensureSessionDirectory();
  }

  private ensureSessionDirectory(): void {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
        logger.info(`✅ Diretório de sessão criado: ${this.sessionPath}`);
      }
    } catch (error) {
      logger.error('❌ Erro ao criar diretório de sessão:', error);
    }
  }

  async initialize() {
    // 🔒 Prevenir inicialização concorrente
    if (this.isInitializing) {
      logger.warn('⚠️  Inicialização já em andamento, ignorando...');
      return;
    }

    // 🔒 Verificar se socket já está conectado
    if (this.isConnected && this.sock) {
      logger.info('✅ Socket já conectado; abortando nova init.');
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
      
      // 🔒 Desconectar socket anterior antes de criar novo
      if (this.sock) {
        await this.cleanupSocket();
      }
      
      const sessionDir = path.join(this.sessionPath, 'session');
      const { state, saveCreds } = await this.baileys.useMultiFileAuthState(sessionDir);

      const { version } = await this.baileys.fetchLatestBaileysVersion();
      logger.info(`📦 Versão do Baileys: ${version.join('.')}`);

      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: true,
        version,
        defaultQueryTimeoutMs: 120000, // 2 minutos
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 10000, // Keep alive a cada 10s
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 10,
        getMessage: async () => undefined,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        qrTimeout: 120000, // 2 minutos para QR code
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
      });

      // 🔒 Tratar erros do WebSocket para evitar crash
      this.setupWebSocketHandlers();

      // 🔒 Tratar erros não capturados do socket
      this.sock.ev.on('error' as any, (error: any) => {
        logger.warn('⚠️ Socket error event (tratado):', error.message);
      });

      // Event: Atualização de conexão
      this.sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update);
      });

      // Event: Atualização de credenciais
      this.sock.ev.on('creds.update', saveCreds);

      // Event: Mensagens recebidas
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        await this.handleMessagesUpsert(messages, type);
      });

      // Event: Status de mensagem atualizado
      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          this.emit('messageUpdate', update);
        }
      });

      // 🔒 Timeout de inicialização
      setTimeout(() => {
        if (!this.isConnected && this.isInitializing) {
          this.isInitializing = false;
          logger.info('⏱️  Timeout de inicialização, marcando como concluída');
        }
      }, 10000);

    } catch (error) {
      this.isInitializing = false;
      this.reconnecting = false;
      logger.error('❌ Erro ao inicializar Baileys:', error);
      throw error;
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.sock?.ws) return;

    this.sock.ws.on('error', (error: any) => {
      logger.warn('⚠️ WebSocket error (tratado):', error.message);
    });

    this.sock.ws.on('close', (code: number, reason: string) => {
      logger.info(`🔌 WebSocket fechado: code=${code}, reason=${reason || 'sem motivo'}`);
      this.lastWSState = 3; // CLOSED
    });

    this.sock.ws.on('open', () => {
      logger.info('🔌 WebSocket aberto');
      this.lastWSState = 1; // OPEN
    });
  }

  private async handleConnectionUpdate(update: any): Promise<void> {
    const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

    logger.info('🔄 Connection Update:', {
      connection,
      isNewLogin,
      isOnline,
      hasQR: !!qr,
      hasDisconnect: !!lastDisconnect
    });

    if (qr) {
      this.qrCode = await QRCode.toDataURL(qr);
      logger.info('📱 QR Code gerado - Aguardando pareamento...');
      this.emit('qr', this.qrCode);
    }

    if (connection === 'close') {
      await this.handleConnectionClose(lastDisconnect);
    } else if (connection === 'open') {
      await this.handleConnectionOpen(isNewLogin);
    } else if (connection === 'connecting') {
      logger.info('🔄 Conectando ao WhatsApp...');
    }
  }

  private async handleConnectionClose(lastDisconnect: any): Promise<void> {
    const err = lastDisconnect?.error as any;
    const statusCode = err?.output?.statusCode;
    const shouldReconnect = statusCode !== this.baileys!.DisconnectReason.loggedOut;

    const isStreamError = err?.message?.includes('Stream Errored') || 
                         err?.message?.includes('Connection Closed') ||
                         err?.message?.includes('Connection Terminated');

    if (isStreamError) {
      logger.info('🔌 Conexão perdida (stream error) - reconectando...');
    } else {
      logger.warn('⚠️ Conexão fechada:', {
        statusCode,
        message: err?.message,
        shouldReconnect,
        reconnectAttempts: this.reconnectAttempts
      });
    }

    this.isInitializing = false;

    if (statusCode === this.baileys!.DisconnectReason.loggedOut) {
      logger.warn('⚠️ Usuário fez logout do WhatsApp');
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.emit('disconnected');
      return;
    }

    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.scheduleReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('⚠️ Limite de tentativas de reconexão atingido.');
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.emit('disconnected');
    } else {
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting) {
      logger.warn('⚠️  Reconexão já em andamento, ignorando...');
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    );
    
    logger.info(`🔄 Reconectando automaticamente (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${Math.round(delay/1000)}s...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        logger.error('❌ Erro na reconexão:', error);
      } finally {
        this.reconnecting = false;
      }
    }, delay);
  }

  private async handleConnectionOpen(isNewLogin: boolean | undefined): Promise<void> {
    this.isConnected = true;
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.lastMessageTime = new Date();
    this.connectionLostCount = 0;
    
    if (isNewLogin) {
      logger.info('✅ Baileys conectado! (NOVO LOGIN)');
    } else {
      logger.info('✅ Baileys conectado! (SESSÃO RESTAURADA)');
      logger.info('🎉 Não é necessário escanear QR Code novamente!');
    }
    
    this.emit('connected');
    this.startHealthCheck();
    this.startKeepAlive();
  }

  private async handleMessagesUpsert(messages: any[], type: string): Promise<void> {
    if (type !== 'notify') return;

    for (const message of messages) {
      if (!message.message) continue;

      const messageData = this.extractMessageData(message);
      this.lastMessageTime = new Date();
      
      logger.info('📨 Nova mensagem Baileys:', messageData);
      this.emit('message', messageData);
    }
  }

  private extractMessageData(message: import('@whiskeysockets/baileys').proto.IWebMessageInfo) {
    const remoteJid = message.key.remoteJid || '';
    const messageType = Object.keys(message.message || {})[0];
    
    let content = '';
    let mediaUrl = undefined;

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
      stickerMessage: 'sticker',
    };

    return typeMap[type] || 'text';
  }

  async sendTextMessage(phoneNumber: string, text: string, retryCount: number = 0): Promise<void> {
    if (!this.sock || !this.isConnected) {
      throw new Error('Baileys não está conectado');
    }

    // Verificar se WebSocket está aberto
    if (!this.sock.ws) {
      logger.error('❌ [sendTextMessage] WebSocket é null/undefined');
      this.isConnected = false;
      throw new Error('WebSocket não disponível');
    }

    const wsReadyState = (this.sock.ws as any).readyState;
    if (wsReadyState !== 1) {
      logger.warn(`⚠️ [sendTextMessage] WebSocket não está aberto (readyState: ${wsReadyState})`);
      this.isConnected = false;
      throw new Error('Conexão WebSocket não está ativa');
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📤 Enviando para ${phoneNumber} (JID: ${jid})`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada com sucesso para ${phoneNumber}`);
      this.lastMessageTime = new Date();
    } catch (error: any) {
      logger.error(`❌ Erro ao enviar mensagem:`, {
        message: error?.message,
        name: error?.name,
        code: error?.code
      });
      
      const isConnectionError = 
        error?.message?.includes('Connection Closed') ||
        error?.message?.includes('Connection Terminated') ||
        error?.message?.includes('Stream Errored') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'EPIPE';
      
      if (isConnectionError && retryCount < 2) {
        logger.warn(`🔄 Erro de conexão, tentando reenviar (${retryCount + 1}/2)...`);
        this.isConnected = false;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!this.isConnected && !this.reconnecting && !this.isInitializing) {
          await this.initialize();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        return this.sendTextMessage(phoneNumber, text, retryCount + 1);
      }
      
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string,
    type: 'image' | 'video' | 'audio' | 'document' = 'image'
  ): Promise<void> {
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
      this.lastMessageTime = new Date();
    } catch (error) {
      logger.error('Erro ao enviar mídia:', error);
      throw error;
    }
  }

  async downloadMedia(message: import('@whiskeysockets/baileys').proto.IWebMessageInfo): Promise<Buffer> {
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

      return buffer as Buffer;
    } catch (error) {
      logger.error('Erro ao baixar mídia:', error);
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

  getQRCode(): string | null {
    return this.qrCode;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    logger.info('💓 Iniciando keep-alive periódico (a cada 2 minutos)');

    this.keepAliveInterval = setInterval(async () => {
      if (!this.isConnected || !this.sock) {
        return;
      }

      if (this.sock.ws && (this.sock.ws as any).readyState === 1) {
        try {
          await this.sock.sendPresenceUpdate('available');
          this.lastKeepAlive = new Date();
          logger.info('💓 Keep-alive enviado');
        } catch (error: any) {
          logger.warn('⚠️ Erro no keep-alive:', error?.message);
        }
      } else {
        logger.warn('⚠️ Keep-alive: WebSocket não está aberto');
        this.isConnected = false;
      }
    }, 120000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.info('💓 Keep-alive parado');
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('🏥 Iniciando monitoramento de saúde da conexão');

    this.healthCheckInterval = setInterval(async () => {
      const now = new Date();
      const timeSinceLastMessage = now.getTime() - this.lastMessageTime.getTime();
      const minutesSinceLastMessage = Math.floor(timeSinceLastMessage / 60000);

      logger.info(`🏥 Health Check: Conexão ${this.isConnected ? 'ATIVA' : 'INATIVA'} | Última atividade: ${minutesSinceLastMessage}min`);

      if (this.isConnected && timeSinceLastMessage > 300000) {
        logger.warn('⚠️ Sem atividade há 5+ minutos, verificando conexão...');
        
        if (this.sock && this.sock.ws && (this.sock.ws as any).readyState === 1) {
          try {
            await this.sock.sendPresenceUpdate('available');
            this.lastMessageTime = new Date();
            this.connectionLostCount = 0;
            logger.info('✅ Ping de presença enviado');
          } catch (error: any) {
            logger.warn('⚠️ Erro ao enviar ping:', error?.message);
            this.connectionLostCount++;
            
            if (this.connectionLostCount >= 3) {
              logger.error('❌ Conexão perdida! Reconectando...');
              this.isConnected = false;
              this.connectionLostCount = 0;
              this.initialize().catch(err => {
                logger.error('Erro ao reconectar:', err);
              });
            }
          }
        } else {
          const wsState = (this.sock?.ws as any)?.readyState || 'N/A';
          logger.warn(`⚠️ WebSocket não está aberto (readyState: ${wsState})`);
          this.isConnected = false;
          
          if (this.reconnecting || this.isInitializing) {
            logger.warn('⚠️ Flags travadas detectadas! Resetando...');
            this.reconnecting = false;
            this.isInitializing = false;
          }
          
          this.reconnecting = true;
          this.initialize().catch(err => {
            logger.error('❌ Erro ao reconectar:', err);
            this.reconnecting = false;
          });
        }
      }
    }, 30000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('🏥 Monitoramento de saúde parado');
    }
  }

  private async cleanupSocket(): Promise<void> {
    if (!this.sock) return;

    try {
      this.sock.ev.removeAllListeners('connection.update');
      this.sock.ev.removeAllListeners('creds.update');
      this.sock.ev.removeAllListeners('messages.upsert');
      this.sock.ev.removeAllListeners('messages.update');
      
      if (this.sock.ws) {
        try {
          this.sock.ws.close();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.warn('⚠️ Erro ao fechar WebSocket:', error);
        }
      }
      
      this.sock.end(undefined);
      this.sock = null;
      logger.info('Socket anterior encerrado');
    } catch (error) {
      logger.error('Erro ao encerrar socket anterior:', error);
      this.sock = null;
    }
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
    this.stopKeepAlive();

    if (this.sock) {
      try {
        await this.cleanupSocket();
        await this.sock.logout();
      } catch (error) {
        logger.error('Erro ao fazer logout:', error);
      }
      this.isConnected = false;
      this.qrCode = null;
      this.isInitializing = false;
      logger.info('Baileys desconectado');
    }
  }

  async forceNewQR(): Promise<string> {
    logger.info('🔄 [forceNewQR] Iniciando processo de geração de QR Code...');
    
    if (this.isInitializing) {
      logger.warn('⚠️ [forceNewQR] Inicialização travada, forçando reset...');
      this.isInitializing = false;
      this.reconnecting = false;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Limpar timeouts e intervalos
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.stopHealthCheck();
    this.stopKeepAlive();

    // Resetar flags
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.reconnecting = false;
    this.isConnected = false;
    this.connectionLostCount = 0;
    
    // Desconectar sessão atual
    if (this.sock) {
      await this.cleanupSocket();
    }

    // Limpar sessão salva
    const sessionDir = path.join(this.sessionPath, 'session');
    logger.info('🗑️ [forceNewQR] Removendo sessão salva...');
    
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ [forceNewQR] Sessão removida');
      }
      
      logger.info('⏳ [forceNewQR] Aguardando 3s...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error: any) {
      logger.error('❌ [forceNewQR] Erro ao remover sessão:', error?.message);
    }

    // Reinicializar
    logger.info('🚀 [forceNewQR] Iniciando nova conexão...');
    
    this.removeAllListeners('qr');
    this.removeAllListeners('connected');
    this.removeAllListeners('disconnected');
    
    try {
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na inicialização')), 30000)
        )
      ]);
    } catch (error: any) {
      logger.error('❌ [forceNewQR] Erro ao inicializar:', error?.message);
      this.isInitializing = false;
      this.reconnecting = false;
      throw new Error('Falha ao inicializar WhatsApp. ' + (error?.message || ''));
    }
    
    // Aguardar QR Code
    logger.info('⏳ [forceNewQR] Aguardando QR Code (timeout: 60s)...');
    
    return new Promise<string>((resolve, reject) => {
      let resolved = false;
      
      this.qrTimeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.qrTimeout = null;
        this.isInitializing = false;
        reject(new Error('Timeout ao gerar QR Code'));
      }, 60000);

      const qrListener = (qr: string) => {
        if (resolved) return;
        resolved = true;
        
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        
        logger.info('✅ [forceNewQR] QR Code gerado!');
        resolve(qr);
      };
      
      const disconnectListener = () => {
        if (resolved) return;
        resolved = true;
        
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        
        this.isInitializing = false;
        reject(new Error('Conexão perdida antes de gerar QR Code'));
      };
      
      this.once('qr', qrListener);
      this.once('disconnected', disconnectListener);
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
    this.stopKeepAlive();
    this.removeAllListeners();
  }
}