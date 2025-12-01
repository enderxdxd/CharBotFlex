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
  
  // Keep-alive
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastKeepAlive: Date = new Date();
  
  // 🔧 NOVO: Fila de mensagens pendentes
  private messageQueue: Array<{
    phoneNumber: string;
    text: string;
    resolve: (value: void) => void;
    reject: (reason: any) => void;
    timestamp: Date;
  }> = [];
  private isProcessingQueue: boolean = false;
  
  // 🔧 NOVO: Contadores para monitoramento
  private stats = {
    messagesSent: 0,
    messagesFailed: 0,
    reconnections: 0,
    lastError: null as string | null,
  };

  constructor() {
    super();
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || '/data/baileys_sessions';
    logger.info(`📁 Session path: ${this.sessionPath}`);
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
    if (this.isInitializing) {
      logger.warn('⚠️  Inicialização já em andamento, aguardando...');
      // Aguardar até inicialização terminar (max 30s)
      const maxWait = 30000;
      const startWait = Date.now();
      while (this.isInitializing && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }

    if (this.isConnected && this.sock && this.isWebSocketOpen()) {
      logger.info('✅ Socket já conectado e WebSocket aberto');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isInitializing = true;

    try {
      logger.info('🔄 Inicializando Baileys...');
      
      if (!this.baileys) {
        logger.info('📦 Carregando módulo Baileys...');
        this.baileys = await import('@whiskeysockets/baileys');
        logger.info('✅ Módulo Baileys carregado');
      }
      
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
        defaultQueryTimeoutMs: 120000,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 10,
        getMessage: async () => undefined,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        qrTimeout: 120000,
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
      });

      this.setupWebSocketHandlers();
      
      this.sock.ev.on('error' as any, (error: any) => {
        logger.warn('⚠️ Socket error event (tratado):', error.message);
      });

      this.sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update);
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        await this.handleMessagesUpsert(messages, type);
      });

      this.sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          this.emit('messageUpdate', update);
        }
      });

      setTimeout(() => {
        if (!this.isConnected && this.isInitializing) {
          this.isInitializing = false;
          logger.info('⏱️  Timeout de inicialização');
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
      logger.warn('⚠️ WebSocket error:', error.message);
      this.stats.lastError = error.message;
    });

    this.sock.ws.on('close', (code: number, reason: string) => {
      logger.info(`🔌 WebSocket fechado: code=${code}, reason=${reason || 'sem motivo'}`);
      this.isConnected = false;
      
      // 🔧 CRÍTICO: Processar fila de mensagens pendentes como falha
      this.clearMessageQueue('WebSocket fechado');
    });

    this.sock.ws.on('open', () => {
      logger.info('🔌 WebSocket aberto');
      
      // 🔧 NOVO: Processar fila quando WebSocket abre
      this.processMessageQueue();
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
    this.isConnected = false;
    
    // 🔧 Limpar fila de mensagens
    this.clearMessageQueue('Conexão fechada');

    if (statusCode === this.baileys!.DisconnectReason.loggedOut) {
      logger.warn('⚠️ Usuário fez logout do WhatsApp');
      this.reconnectAttempts = 0;
      this.emit('disconnected');
      return;
    }

    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.scheduleReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('⚠️ Limite de tentativas de reconexão atingido.');
      this.reconnectAttempts = 0;
      this.emit('disconnected');
    } else {
      this.emit('disconnected');
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting) {
      logger.warn('⚠️  Reconexão já em andamento');
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts++;
    this.stats.reconnections++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    );
    
    logger.info(`🔄 Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${Math.round(delay/1000)}s...`);
    
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
    }
    
    this.emit('connected');
    this.startHealthCheck();
    this.startKeepAlive();
    
    // 🔧 CRÍTICO: Processar fila de mensagens pendentes
    await this.processMessageQueue();
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

  // 🔧 NOVO: Verificar se WebSocket está realmente aberto
  private isWebSocketOpen(): boolean {
    if (!this.sock?.ws) return false;
    
    try {
      const readyState = (this.sock.ws as any).readyState;
      return readyState === 1; // 1 = OPEN
    } catch (error) {
      return false;
    }
  }

  // 🔧 NOVO: Verificar e garantir conexão antes de enviar
  private async ensureConnection(): Promise<boolean> {
    // Se não tem socket, tentar inicializar
    if (!this.sock) {
      logger.warn('⚠️ Socket não existe, tentando inicializar...');
      
      if (!this.isInitializing && !this.reconnecting) {
        try {
          await this.initialize();
          // Aguardar até 10s para conexão estabelecer
          const maxWait = 10000;
          const startWait = Date.now();
          while (!this.isConnected && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.error('❌ Falha ao inicializar:', error);
          return false;
        }
      }
    }

    // Verificar se está conectado e WebSocket está aberto
    if (!this.isConnected || !this.isWebSocketOpen()) {
      logger.warn('⚠️ Não conectado ou WebSocket não está aberto');
      
      // Se não está inicializando nem reconectando, tentar reconectar
      if (!this.isInitializing && !this.reconnecting) {
        logger.info('🔄 Tentando reconectar...');
        this.isConnected = false;
        
        try {
          await this.initialize();
          // Aguardar até 10s
          const maxWait = 10000;
          const startWait = Date.now();
          while (!this.isConnected && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.error('❌ Falha ao reconectar:', error);
          return false;
        }
      }
    }

    return this.isConnected && this.isWebSocketOpen();
  }

  async sendTextMessage(phoneNumber: string, text: string, retryCount: number = 0): Promise<void> {
    // 🔧 CRÍTICO: Verificar e garantir conexão ANTES de tentar enviar
    const isConnected = await this.ensureConnection();
    
    if (!isConnected) {
      logger.warn('⚠️ Não foi possível estabelecer conexão, adicionando à fila...');
      
      // Adicionar à fila para processar quando conectar
      return new Promise((resolve, reject) => {
        this.messageQueue.push({
          phoneNumber,
          text,
          resolve,
          reject,
          timestamp: new Date(),
        });
        
        logger.info(`📥 Mensagem adicionada à fila (${this.messageQueue.length} pendentes)`);
        
        // Timeout de 60 segundos para mensagem na fila
        setTimeout(() => {
          const index = this.messageQueue.findIndex(
            m => m.phoneNumber === phoneNumber && m.text === text
          );
          if (index >= 0) {
            const msg = this.messageQueue.splice(index, 1)[0];
            msg.reject(new Error('Timeout: Conexão não estabelecida em 60s'));
          }
        }, 60000);
      });
    }

    // Verificação final de segurança
    if (!this.sock || !this.sock.ws) {
      throw new Error('Socket ou WebSocket indisponível após ensureConnection');
    }

    const wsReadyState = (this.sock.ws as any).readyState;
    if (wsReadyState !== 1) {
      throw new Error(`WebSocket não está aberto (readyState: ${wsReadyState})`);
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📤 Enviando para ${phoneNumber}`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada com sucesso`);
      this.lastMessageTime = new Date();
      this.stats.messagesSent++;
    } catch (error: any) {
      this.stats.messagesFailed++;
      this.stats.lastError = error?.message;
      
      logger.error(`❌ Erro ao enviar:`, {
        message: error?.message,
        code: error?.code
      });
      
      const isConnectionError = 
        error?.message?.includes('Connection Closed') ||
        error?.message?.includes('Connection Terminated') ||
        error?.message?.includes('Stream Errored') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'EPIPE';
      
      if (isConnectionError && retryCount < 2) {
        logger.warn(`🔄 Erro de conexão, retry ${retryCount + 1}/2...`);
        this.isConnected = false;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.sendTextMessage(phoneNumber, text, retryCount + 1);
      }
      
      throw error;
    }
  }

  // 🔧 NOVO: Processar fila de mensagens pendentes
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    if (!this.isConnected || !this.isWebSocketOpen()) {
      logger.warn('⚠️ Não conectado, não processando fila');
      return;
    }

    this.isProcessingQueue = true;
    logger.info(`📤 Processando fila de mensagens (${this.messageQueue.length} pendentes)...`);

    while (this.messageQueue.length > 0 && this.isConnected && this.isWebSocketOpen()) {
      const message = this.messageQueue.shift();
      if (!message) break;

      try {
        await this.sendTextMessage(message.phoneNumber, message.text);
        message.resolve();
        logger.info(`✅ Mensagem da fila enviada para ${message.phoneNumber}`);
      } catch (error) {
        message.reject(error);
        logger.error(`❌ Falha ao enviar mensagem da fila:`, error);
      }

      // Pequeno delay entre mensagens para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessingQueue = false;
    logger.info(`✅ Fila processada (${this.messageQueue.length} restantes)`);
  }

  // 🔧 NOVO: Limpar fila de mensagens
  private clearMessageQueue(reason: string): void {
    if (this.messageQueue.length === 0) return;

    logger.warn(`⚠️ Limpando fila de ${this.messageQueue.length} mensagens: ${reason}`);
    
    for (const message of this.messageQueue) {
      message.reject(new Error(`Fila limpa: ${reason}`));
    }
    
    this.messageQueue = [];
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string,
    type: 'image' | 'video' | 'audio' | 'document' = 'image'
  ): Promise<void> {
    const isConnected = await this.ensureConnection();
    
    if (!isConnected || !this.sock) {
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
      this.stats.messagesSent++;
    } catch (error) {
      this.stats.messagesFailed++;
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
    return this.isConnected && this.isWebSocketOpen();
  }

  // 🔧 NOVO: Obter estatísticas
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      queueSize: this.messageQueue.length,
      uptime: Date.now() - this.lastMessageTime.getTime(),
    };
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    logger.info('💓 Iniciando keep-alive (a cada 2 min)');

    this.keepAliveInterval = setInterval(async () => {
      if (!this.isConnected || !this.sock) {
        return;
      }

      if (this.isWebSocketOpen()) {
        try {
          await this.sock.sendPresenceUpdate('available');
          this.lastKeepAlive = new Date();
          logger.info('💓 Keep-alive enviado');
        } catch (error: any) {
          logger.warn('⚠️ Erro no keep-alive:', error?.message);
        }
      } else {
        logger.warn('⚠️ Keep-alive: WebSocket fechado');
        this.isConnected = false;
      }
    }, 120000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('🏥 Iniciando health check');

    this.healthCheckInterval = setInterval(async () => {
      const now = new Date();
      const timeSinceLastMessage = now.getTime() - this.lastMessageTime.getTime();
      const minutesSinceLastMessage = Math.floor(timeSinceLastMessage / 60000);

      logger.info(`🏥 Health: ${this.isConnected ? 'OK' : 'DOWN'} | Atividade: ${minutesSinceLastMessage}min | Fila: ${this.messageQueue.length}`);

      if (this.isConnected && timeSinceLastMessage > 300000) {
        logger.warn('⚠️ Sem atividade há 5+ min, verificando...');
        
        if (this.isWebSocketOpen()) {
          try {
            await this.sock!.sendPresenceUpdate('available');
            this.lastMessageTime = new Date();
            this.connectionLostCount = 0;
          } catch (error: any) {
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
          logger.warn('⚠️ WebSocket fechado');
          this.isConnected = false;
          
          if (this.reconnecting || this.isInitializing) {
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
    }
  }

  private async cleanupSocket(): Promise<void> {
    if (!this.sock) return;

    try {
      this.sock.ev.removeAllListeners(undefined);
      
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
      logger.info('Socket limpo');
    } catch (error) {
      logger.error('Erro ao limpar socket:', error);
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
    this.clearMessageQueue('Desconectando');

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
    logger.info('🔄 [forceNewQR] Gerando novo QR Code...');
    
    if (this.isInitializing) {
      this.isInitializing = false;
      this.reconnecting = false;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

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
    this.clearMessageQueue('Gerando novo QR');

    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.reconnecting = false;
    this.isConnected = false;
    this.connectionLostCount = 0;
    
    if (this.sock) {
      await this.cleanupSocket();
    }

    const sessionDir = path.join(this.sessionPath, 'session');
    
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão removida');
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error: any) {
      logger.error('❌ Erro ao remover sessão:', error?.message);
    }

    logger.info('🚀 Iniciando nova conexão...');
    
    this.removeAllListeners('qr');
    this.removeAllListeners('connected');
    this.removeAllListeners('disconnected');
    
    try {
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 30000)
        )
      ]);
    } catch (error: any) {
      logger.error('❌ Erro ao inicializar:', error?.message);
      this.isInitializing = false;
      this.reconnecting = false;
      throw new Error('Falha ao inicializar WhatsApp');
    }
    
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
        reject(new Error('Desconectado antes de gerar QR'));
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
    this.clearMessageQueue('Cleanup');
    this.removeAllListeners();
  }
}