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
  
  // Fila de mensagens pendentes
  private messageQueue: Array<{
    phoneNumber: string;
    text: string;
    resolve: (value: void) => void;
    reject: (reason: any) => void;
    timestamp: Date;
  }> = [];
  private isProcessingQueue: boolean = false;
  
  // Estatísticas
  private stats = {
    messagesSent: 0,
    messagesFailed: 0,
    reconnections: 0,
    lastError: null as string | null,
  };
  
  // 🔧 NOVO: Controle de instância única
  private static instance: BaileysService | null = null;
  private isDisposed: boolean = false;
  
  // 🔧 NOVO: Controle de pairing e prevenção "can't link devices"
  private pairingCode: string | null = null;
  private lastQRTime: Date | null = null;
  private lastConnectionAttempt: Date | null = null;
  private qrAttempts: number = 0;
  private maxQRAttempts: number = 3;
  private readonly MIN_TIME_BETWEEN_ATTEMPTS = 180000; // 3 minutos
  private readonly MIN_TIME_BETWEEN_QR = 120000; // 2 minutos
  private sessionLocked: boolean = false;

  constructor() {
    super();
    
    // 🔧 CRÍTICO: Prevenir múltiplas instâncias
    if (BaileysService.instance && !BaileysService.instance.isDisposed) {
      logger.warn('⚠️ Tentativa de criar múltiplas instâncias do BaileysService!');
      logger.warn('⚠️ Retornando instância existente...');
      return BaileysService.instance;
    }
    
    this.sessionPath = process.env.BAILEYS_SESSION_PATH || '/data/baileys_sessions';
    logger.info(`📁 Session path: ${this.sessionPath}`);
    this.ensureSessionDirectory();
    
    BaileysService.instance = this;
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
    if (this.isDisposed) {
      throw new Error('BaileysService foi descartado. Crie uma nova instância.');
    }

    // 🔧 CRÍTICO: Verificar se sessão está bloqueada
    if (this.sessionLocked) {
      throw new Error('Sessão bloqueada. Aguarde alguns minutos antes de tentar novamente.');
    }

    if (this.isInitializing) {
      logger.warn('⚠️  Inicialização já em andamento, aguardando...');
      const maxWait = 30000;
      const startWait = Date.now();
      while (this.isInitializing && (Date.now() - startWait) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }

    if (this.isConnected) {
      logger.info('✅ Já conectado');
      return;
    }

    // 🔧 CRÍTICO: Cooldown obrigatório entre tentativas de conexão
    if (this.lastConnectionAttempt) {
      const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt.getTime();
      if (timeSinceLastAttempt < this.MIN_TIME_BETWEEN_ATTEMPTS) {
        const waitTime = this.MIN_TIME_BETWEEN_ATTEMPTS - timeSinceLastAttempt;
        const waitSeconds = Math.round(waitTime / 1000);
        logger.error(`🚫 COOLDOWN ATIVO: Aguarde ${waitSeconds}s antes de tentar conectar novamente`);
        logger.error('💡 Isso previne o erro "can\'t link devices" do WhatsApp');
        throw new Error(`Aguarde ${waitSeconds} segundos antes de tentar conectar novamente (prevenção "can't link devices")`);
      }
    }

    // Registrar tentativa de conexão
    this.lastConnectionAttempt = new Date();

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
      
      // 🔧 CRÍTICO: Limpar socket anterior COMPLETAMENTE
      if (this.sock) {
        logger.info('🧹 Limpando socket anterior...');
        await this.cleanupSocket();
        logger.info('⏳ Aguardando 3s após cleanup...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      const sessionDir = path.join(this.sessionPath, 'session');
      
      // 🔧 CRÍTICO: Verificar se sessão existe e está válida
      const sessionExists = fs.existsSync(sessionDir) && 
                           fs.readdirSync(sessionDir).length > 0;
      
      // 🔧 NOVO: Verificar lock de sessão (indica tentativa recente)
      const lockFile = path.join(sessionDir, '.lock');
      if (fs.existsSync(lockFile)) {
        const lockTime = fs.statSync(lockFile).mtime.getTime();
        const timeSinceLock = Date.now() - lockTime;
        
        if (timeSinceLock < this.MIN_TIME_BETWEEN_ATTEMPTS) {
          const waitTime = this.MIN_TIME_BETWEEN_ATTEMPTS - timeSinceLock;
          const waitSeconds = Math.round(waitTime / 1000);
          logger.error(`🔒 Sessão bloqueada! Aguarde ${waitSeconds}s`);
          throw new Error(`Sessão em uso recentemente. Aguarde ${waitSeconds}s (prevenção "can't link devices")`);
        } else {
          // Lock expirado, remover
          fs.unlinkSync(lockFile);
          logger.info('🔓 Lock expirado removido');
        }
      }
      
      // Criar lock de sessão
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      fs.writeFileSync(lockFile, Date.now().toString());
      logger.info('🔒 Lock de sessão criado');
      
      if (sessionExists) {
        logger.info('📂 Sessão anterior encontrada, tentando restaurar...');
      } else {
        logger.info('📂 Nenhuma sessão anterior, será necessário escanear QR Code');
      }
      
      const { state, saveCreds } = await this.baileys.useMultiFileAuthState(sessionDir);

      const { version } = await this.baileys.fetchLatestBaileysVersion();
      logger.info(`📦 Versão do Baileys: ${version.join('.')}`);

      // 🔧 CRÍTICO: Configurações mais conservadoras para evitar "can't link devices"
      // 🔧 CRÍTICO: Configurações ultra-conservadoras para evitar "can't link devices"
      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: false,
        version,
        defaultQueryTimeoutMs: 90000, // 1.5 minutos
        connectTimeoutMs: 90000,
        keepAliveIntervalMs: 30000, // 30s (mais conservador)
        retryRequestDelayMs: 1000, // 1s entre retries
        maxMsgRetryCount: 3, // Apenas 3 tentativas
        getMessage: async () => undefined,
        markOnlineOnConnect: false, // CRÍTICO: Não marcar online
        syncFullHistory: false,
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        qrTimeout: 90000, // 1.5 minutos
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (message) => message,
        // 🔧 NOVO: Desabilitar reconexão automática
        shouldSyncHistoryMessage: () => false,
      });

      this.setupWebSocketHandlers();
      
      this.sock.ev.on('error' as any, (error: any) => {
        logger.warn('⚠️ Socket error event:', error.message);
        this.stats.lastError = error.message;
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
      }, 15000); // Aumentado para 15s

    } catch (error: any) {
      this.isInitializing = false;
      this.reconnecting = false;
      logger.error('❌ Erro ao inicializar Baileys:', error);
      
      // 🔧 NOVO: Detectar erro "can't link devices"
      if (error?.message?.includes('can\'t link devices') || 
          error?.message?.includes('Conflict') ||
          error?.output?.statusCode === 428) {
        logger.error('🚫 ERRO "CAN\'T LINK DEVICES" DETECTADO!');
        logger.error('💡 SOLUÇÃO: Aguarde 2-3 minutos antes de tentar novamente');
        logger.error('💡 CAUSA: Múltiplas tentativas de conexão muito rápidas');
        
        this.qrAttempts++;
        
        if (this.qrAttempts >= this.maxQRAttempts) {
          logger.error('❌ Muitas tentativas falhas. Aguarde 5 minutos antes de tentar novamente.');
          this.qrAttempts = 0;
          throw new Error('Muitas tentativas de conexão. Aguarde 5 minutos e tente escanear o QR Code novamente.');
        }
        
        throw new Error('WhatsApp bloqueou temporariamente novas conexões. Aguarde 2-3 minutos e tente novamente.');
      }
      
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
      this.clearMessageQueue('WebSocket fechado');
    });

    this.sock.ws.on('open', () => {
      logger.info('🔌 WebSocket aberto');
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
      this.lastQRTime = new Date();
      this.qrCode = await QRCode.toDataURL(qr);
      logger.info('📱 QR Code gerado - Aguardando pareamento...');
      logger.info('⚠️  IMPORTANTE: Escaneie o QR Code UMA VEZ e aguarde conectar');
      logger.info('⚠️  NÃO escaneie múltiplas vezes ou terá erro "can\'t link devices"');
      this.emit('qr', this.qrCode);
    }

    if (connection === 'close') {
      await this.handleConnectionClose(lastDisconnect);
    } else if (connection === 'open') {
      await this.handleConnectionOpen(isNewLogin);
    } else if (connection === 'connecting') {
      logger.info('🔄 Conectando ao WhatsApp...');
      logger.info('⏳ Aguardando resposta do servidor WhatsApp...');
    }
  }

  private async handleConnectionClose(lastDisconnect: any): Promise<void> {
    const err = lastDisconnect?.error as any;
    const statusCode = err?.output?.statusCode;
    
    // 🔧 CRÍTICO: Detectar "can't link devices" ou Conflict
    if (statusCode === 428 || 
        err?.message?.includes('can\'t link devices') ||
        err?.message?.includes('Conflict') ||
        statusCode === 409) {
      logger.error('🚫 ERRO "CAN\'T LINK DEVICES" ou CONFLICT DETECTADO!');
      logger.error('💡 Causa provável: Múltiplas tentativas de conexão simultâneas');
      logger.error('💡 Solução: Aguarde 2-3 minutos antes de tentar novamente');
      logger.error('💡 IMPORTANTE: Escaneie o QR Code apenas UMA VEZ');
      
      this.isInitializing = false;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      
      // Limpar sessão corrompida
      await this.clearCorruptedSession();
      
      this.emit('error', new Error('can\'t link devices - Aguarde 2-3 minutos antes de tentar novamente'));
      return;
    }
    
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
      logger.warn('⚠️ Limite de reconexões atingido');
      this.reconnectAttempts = 0;
      this.emit('disconnected');
    } else {
      this.emit('disconnected');
    }
  }

  // 🔧 NOVO: Limpar sessão corrompida
  private async clearCorruptedSession(): Promise<void> {
    logger.info('🗑️ Limpando sessão corrompida...');
    
    const sessionDir = path.join(this.sessionPath, 'session');
    
    try {
      if (fs.existsSync(sessionDir)) {
        // Fazer backup da sessão antes de deletar
        const backupDir = path.join(this.sessionPath, `session_backup_${Date.now()}`);
        try {
          fs.cpSync(sessionDir, backupDir, { recursive: true });
          logger.info(`📦 Backup da sessão criado em: ${backupDir}`);
        } catch (backupError) {
          logger.warn('⚠️ Não foi possível fazer backup da sessão');
        }
        
        // Deletar sessão corrompida
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão corrompida removida');
      }
    } catch (error) {
      logger.error('❌ Erro ao limpar sessão:', error);
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
    
    // 🔧 CRÍTICO: Backoff mais agressivo para evitar "can't link devices"
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), // Backoff exponencial de 2x
      120000 // Máximo 2 minutos
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
    this.qrAttempts = 0; // Reset QR attempts
    this.isInitializing = false;
    this.lastMessageTime = new Date();
    this.connectionLostCount = 0;
    
    if (isNewLogin) {
      logger.info('✅ Baileys conectado! (NOVO LOGIN)');
      logger.info('📱 Dispositivo pareado com sucesso');
    } else {
      logger.info('✅ Baileys conectado! (SESSÃO RESTAURADA)');
      logger.info('🎉 Não é necessário escanear QR Code novamente!');
    }
    
    this.emit('connected');
    
    // 🔧 Aguardar 3 segundos antes de iniciar health check e processar fila
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    this.startHealthCheck();
    this.startKeepAlive();
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

  private isWebSocketOpen(): boolean {
    if (!this.sock?.ws) return false;
    
    try {
      const readyState = (this.sock.ws as any).readyState;
      return readyState === 1;
    } catch (error) {
      return false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (!this.sock) {
      logger.warn('⚠️ Socket não existe, tentando inicializar...');
      
      if (!this.isInitializing && !this.reconnecting) {
        try {
          await this.initialize();
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

    if (!this.isConnected || !this.isWebSocketOpen()) {
      logger.warn('⚠️ Não conectado ou WebSocket não está aberto');
      
      if (!this.isInitializing && !this.reconnecting) {
        logger.info('🔄 Tentando reconectar...');
        this.isConnected = false;
        
        try {
          await this.initialize();
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
    const isConnected = await this.ensureConnection();
    
    if (!isConnected) {
      logger.warn('⚠️ Não conectado, adicionando à fila...');
      
      return new Promise((resolve, reject) => {
        this.messageQueue.push({
          phoneNumber,
          text,
          resolve,
          reject,
          timestamp: new Date(),
        });
        
        logger.info(`📥 Mensagem na fila (${this.messageQueue.length} pendentes)`);
        
        setTimeout(() => {
          const index = this.messageQueue.findIndex(
            m => m.phoneNumber === phoneNumber && m.text === text
          );
          if (index >= 0) {
            const msg = this.messageQueue.splice(index, 1)[0];
            msg.reject(new Error('Timeout: Não conectado em 60s'));
          }
        }, 60000);
      });
    }

    if (!this.sock || !this.sock.ws) {
      throw new Error('Socket ou WebSocket indisponível');
    }

    const wsReadyState = (this.sock.ws as any).readyState;
    if (wsReadyState !== 1) {
      throw new Error(`WebSocket não está aberto (readyState: ${wsReadyState})`);
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📤 Enviando para ${phoneNumber}`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada`);
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
        logger.warn(`🔄 Retry ${retryCount + 1}/2...`);
        this.isConnected = false;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.sendTextMessage(phoneNumber, text, retryCount + 1);
      }
      
      throw error;
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    if (!this.isConnected || !this.isWebSocketOpen()) {
      logger.warn('⚠️ Não conectado, não processando fila');
      return;
    }

    this.isProcessingQueue = true;
    logger.info(`📤 Processando fila (${this.messageQueue.length} pendentes)...`);

    while (this.messageQueue.length > 0 && this.isConnected && this.isWebSocketOpen()) {
      const message = this.messageQueue.shift();
      if (!message) break;

      try {
        await this.sendTextMessage(message.phoneNumber, message.text);
        message.resolve();
        logger.info(`✅ Mensagem da fila enviada`);
      } catch (error) {
        message.reject(error);
        logger.error(`❌ Falha ao enviar da fila:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessingQueue = false;
    logger.info(`✅ Fila processada`);
  }

  private clearMessageQueue(reason: string): void {
    if (this.messageQueue.length === 0) return;

    logger.warn(`⚠️ Limpando fila: ${reason}`);
    
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
      
      logger.info(`✅ Mídia enviada`);
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

  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      queueSize: this.messageQueue.length,
      uptime: Date.now() - this.lastMessageTime.getTime(),
      qrAttempts: this.qrAttempts,
    };
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    logger.info('💓 Iniciando keep-alive');

    this.keepAliveInterval = setInterval(async () => {
      if (!this.isConnected || !this.sock) {
        return;
      }

      if (this.isWebSocketOpen()) {
        try {
          await this.sock.sendPresenceUpdate('available');
          this.lastKeepAlive = new Date();
        } catch (error: any) {
          logger.warn('⚠️ Erro no keep-alive:', error?.message);
        }
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

      if (this.isConnected && timeSinceLastMessage > 300000) {
        
        if (this.isWebSocketOpen()) {
          try {
            await this.sock!.sendPresenceUpdate('available');
            this.lastMessageTime = new Date();
            this.connectionLostCount = 0;
          } catch (error: any) {
            this.connectionLostCount++;
            
            if (this.connectionLostCount >= 3) {
              logger.error('❌ Conexão perdida!');
              this.isConnected = false;
              this.connectionLostCount = 0;
              this.initialize().catch(err => {
                logger.error('Erro ao reconectar:', err);
              });
            }
          }
        } else {
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
          await new Promise(resolve => setTimeout(resolve, 2000));
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
    
    // Remover lock de sessão
    this.removeLockFile();
  }

  async forceNewQR(): Promise<string> {
    logger.info('🔄 [forceNewQR] Gerando novo QR Code...');
    
    // 🔧 CRÍTICO: Verificar cooldown desde última tentativa de conexão
    if (this.lastConnectionAttempt) {
      const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt.getTime();
      if (timeSinceLastAttempt < this.MIN_TIME_BETWEEN_ATTEMPTS) {
        const waitTime = this.MIN_TIME_BETWEEN_ATTEMPTS - timeSinceLastAttempt;
        const waitSeconds = Math.round(waitTime / 1000);
        logger.error(`🚫 COOLDOWN ATIVO: Aguarde ${waitSeconds}s antes de gerar novo QR`);
        throw new Error(`Aguarde ${waitSeconds} segundos antes de gerar novo QR Code (prevenção "can't link devices")`);
      }
    }
    
    // 🔧 CRÍTICO: Verificar tempo desde último QR
    if (this.lastQRTime) {
      const timeSinceLastQR = Date.now() - this.lastQRTime.getTime();
      if (timeSinceLastQR < this.MIN_TIME_BETWEEN_QR) {
        const waitTime = this.MIN_TIME_BETWEEN_QR - timeSinceLastQR;
        const waitSeconds = Math.round(waitTime / 1000);
        logger.error(`🚫 QR muito recente: Aguarde ${waitSeconds}s`);
        throw new Error(`Aguarde ${waitSeconds} segundos antes de gerar novo QR Code`);
      }
    }
    
    if (this.isInitializing) {
      this.isInitializing = false;
      this.reconnecting = false;
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
        // Remover lock primeiro
        this.removeLockFile();
        
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão removida');
      }
      
      // 🔧 CRÍTICO: Aguardar 5 segundos após remover sessão
      logger.info('⏳ Aguardando 5s para estabilizar...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
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
      
      if (error?.message?.includes('can\'t link devices')) {
        throw new Error('WhatsApp bloqueou temporariamente. Aguarde 2-3 minutos e tente novamente.');
      }
      
      throw error;
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
      
      const errorListener = (error: Error) => {
        if (resolved) return;
        resolved = true;
        
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        
        this.isInitializing = false;
        reject(error);
      };
      
      this.once('qr', qrListener);
      this.once('disconnected', disconnectListener);
      this.once('error', errorListener);
    });
  }

  // 🔧 NOVO: Remover arquivo de lock
  private removeLockFile(): void {
    try {
      const sessionDir = path.join(this.sessionPath, 'session');
      const lockFile = path.join(sessionDir, '.lock');
      
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        logger.info('🔓 Lock de sessão removido');
      }
    } catch (error) {
      logger.warn('⚠️ Erro ao remover lock:', error);
    }
  }

  cleanup(): void {
    this.isDisposed = true;
    
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
    
    // Remover lock de sessão
    this.removeLockFile();
    
    BaileysService.instance = null;
  }
}