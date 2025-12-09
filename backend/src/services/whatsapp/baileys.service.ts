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

// 🆕 Estado global para controle de cooldown entre processos/requests
interface GlobalCooldownState {
  lastConnectionAttempt: number | null;
  lastQRTime: number | null;
  isConnecting: boolean;
}

// Arquivo de cooldown persistente
const COOLDOWN_FILE = '/tmp/baileys_cooldown.json';

export class BaileysService extends EventEmitter {
  private sock: WASocket | null = null;
  private baileys: BaileysModule | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private sessionPath: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3; // 🔧 Reduzido de 5 para 3
  private reconnectDelay: number = 10000; // 🔧 Aumentado de 5s para 10s
  
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
  
  // 🔧 Controle de instância única
  private static instance: BaileysService | null = null;
  private isDisposed: boolean = false;
  
  // 🔧 MELHORADO: Controle de pairing e prevenção "can't link devices"
  private pairingCode: string | null = null;
  private lastQRTime: Date | null = null;
  private lastConnectionAttempt: Date | null = null;
  private qrAttempts: number = 0;
  private maxQRAttempts: number = 2; // 🔧 Reduzido de 3 para 2
  
  // 🔧 AUMENTADO: Cooldowns mais conservadores
  private readonly MIN_TIME_BETWEEN_ATTEMPTS = 300000; // 🔧 5 minutos (era 3)
  private readonly MIN_TIME_BETWEEN_QR = 180000; // 🔧 3 minutos (era 2)
  private readonly COOLDOWN_AFTER_ERROR = 600000; // 🆕 10 minutos após erro
  
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
    
    // 🆕 Carregar estado de cooldown do arquivo
    this.loadCooldownState();
    
    BaileysService.instance = this;
  }

  // 🆕 Carregar estado de cooldown persistente
  private loadCooldownState(): void {
    try {
      if (fs.existsSync(COOLDOWN_FILE)) {
        const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8')) as GlobalCooldownState;
        if (data.lastConnectionAttempt) {
          this.lastConnectionAttempt = new Date(data.lastConnectionAttempt);
        }
        if (data.lastQRTime) {
          this.lastQRTime = new Date(data.lastQRTime);
        }
        logger.info('📂 Estado de cooldown carregado');
      }
    } catch (error) {
      logger.warn('⚠️ Erro ao carregar estado de cooldown:', error);
    }
  }

  // 🆕 Salvar estado de cooldown persistente
  private saveCooldownState(): void {
    try {
      const state: GlobalCooldownState = {
        lastConnectionAttempt: this.lastConnectionAttempt?.getTime() || null,
        lastQRTime: this.lastQRTime?.getTime() || null,
        isConnecting: this.isInitializing,
      };
      fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(state), 'utf8');
    } catch (error) {
      logger.warn('⚠️ Erro ao salvar estado de cooldown:', error);
    }
  }

  // 🆕 Verificar cooldown global
  private checkCooldown(): { canProceed: boolean; waitSeconds: number; reason: string } {
    const now = Date.now();
    
    // Verificar cooldown de conexão
    if (this.lastConnectionAttempt) {
      const timeSinceLastAttempt = now - this.lastConnectionAttempt.getTime();
      if (timeSinceLastAttempt < this.MIN_TIME_BETWEEN_ATTEMPTS) {
        const waitTime = this.MIN_TIME_BETWEEN_ATTEMPTS - timeSinceLastAttempt;
        return {
          canProceed: false,
          waitSeconds: Math.ceil(waitTime / 1000),
          reason: 'connection_cooldown'
        };
      }
    }
    
    // Verificar cooldown de QR
    if (this.lastQRTime) {
      const timeSinceLastQR = now - this.lastQRTime.getTime();
      if (timeSinceLastQR < this.MIN_TIME_BETWEEN_QR) {
        const waitTime = this.MIN_TIME_BETWEEN_QR - timeSinceLastQR;
        return {
          canProceed: false,
          waitSeconds: Math.ceil(waitTime / 1000),
          reason: 'qr_cooldown'
        };
      }
    }
    
    return { canProceed: true, waitSeconds: 0, reason: '' };
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

  async initialize(): Promise<void> {
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
      
      // 🆕 Se ainda está inicializando após timeout, retornar
      if (this.isInitializing) {
        logger.warn('⚠️  Timeout aguardando inicialização anterior');
        throw new Error('Inicialização em andamento. Aguarde.');
      }
      return;
    }

    if (this.isConnected && this.isWebSocketOpen()) {
      logger.info('✅ Já conectado');
      return;
    }

    // 🔧 CRÍTICO: Verificar cooldown global
    const cooldown = this.checkCooldown();
    if (!cooldown.canProceed) {
      const message = cooldown.reason === 'connection_cooldown'
        ? `Aguarde ${cooldown.waitSeconds}s antes de tentar conectar (prevenção "can't link devices")`
        : `Aguarde ${cooldown.waitSeconds}s antes de gerar novo QR Code`;
      
      logger.error(`🚫 COOLDOWN ATIVO: ${message}`);
      throw new Error(message);
    }

    // Registrar tentativa de conexão
    this.lastConnectionAttempt = new Date();
    this.saveCooldownState();

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
        logger.info('⏳ Aguardando 5s após cleanup...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 🔧 Aumentado de 3s para 5s
      }
      
      const sessionDir = path.join(this.sessionPath, 'session');
      
      // 🔧 CRÍTICO: Verificar se sessão existe e está válida
      const sessionExists = fs.existsSync(sessionDir) && 
                           fs.readdirSync(sessionDir).length > 0;
      
      // 🔧 Verificar lock de sessão (indica tentativa recente)
      const lockFile = path.join(sessionDir, '.lock');
      if (fs.existsSync(lockFile)) {
        const lockTime = fs.statSync(lockFile).mtime.getTime();
        const timeSinceLock = Date.now() - lockTime;
        
        if (timeSinceLock < this.MIN_TIME_BETWEEN_ATTEMPTS) {
          const waitTime = this.MIN_TIME_BETWEEN_ATTEMPTS - timeSinceLock;
          const waitSeconds = Math.round(waitTime / 1000);
          logger.error(`🔒 Sessão bloqueada! Aguarde ${waitSeconds}s`);
          this.isInitializing = false;
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

      // 🔧 CRÍTICO: Configurações ultra-conservadoras para evitar "can't link devices"
      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: false,
        version,
        defaultQueryTimeoutMs: 120000, // 🔧 2 minutos (era 1.5)
        connectTimeoutMs: 120000, // 🔧 2 minutos
        keepAliveIntervalMs: 45000, // 🔧 45s (era 30s)
        retryRequestDelayMs: 2000, // 🔧 2s entre retries (era 1s)
        maxMsgRetryCount: 2, // 🔧 Apenas 2 tentativas (era 3)
        getMessage: async () => undefined,
        markOnlineOnConnect: false, // CRÍTICO: Não marcar online
        syncFullHistory: false,
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        qrTimeout: 120000, // 🔧 2 minutos (era 1.5)
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (message) => message,
        shouldSyncHistoryMessage: () => false,
        // 🆕 Configurações adicionais de estabilidade
        fireInitQueries: false, // Não disparar queries iniciais
      });

      this.setupWebSocketHandlers();
      
      this.sock.ev.on('error' as any, (error: any) => {
        logger.warn('⚠️ Socket error event:', error.message);
        this.stats.lastError = error.message;
        
        // 🆕 Se for erro de link, marcar cooldown longo
        if (error.message?.includes("can't link") || error.message?.includes('Conflict')) {
          this.lastConnectionAttempt = new Date(Date.now() + this.COOLDOWN_AFTER_ERROR - this.MIN_TIME_BETWEEN_ATTEMPTS);
          this.saveCooldownState();
        }
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

      // 🔧 Aumentado timeout de inicialização
      setTimeout(() => {
        if (!this.isConnected && this.isInitializing) {
          this.isInitializing = false;
          logger.info('⏱️  Timeout de inicialização');
        }
      }, 30000); // 🔧 Aumentado de 15s para 30s

    } catch (error: any) {
      this.isInitializing = false;
      this.reconnecting = false;
      logger.error('❌ Erro ao inicializar Baileys:', error);
      
      // 🔧 Detectar erro "can't link devices"
      if (error?.message?.includes('can\'t link devices') || 
          error?.message?.includes('Conflict') ||
          error?.output?.statusCode === 428 ||
          error?.output?.statusCode === 409) {
        logger.error('🚫 ERRO "CAN\'T LINK DEVICES" DETECTADO!');
        logger.error('💡 SOLUÇÃO: Aguarde 5-10 minutos antes de tentar novamente');
        logger.error('💡 CAUSA: Múltiplas tentativas de conexão muito rápidas');
        
        // 🆕 Forçar cooldown longo
        this.lastConnectionAttempt = new Date(Date.now() + this.COOLDOWN_AFTER_ERROR - this.MIN_TIME_BETWEEN_ATTEMPTS);
        this.saveCooldownState();
        
        this.qrAttempts++;
        
        if (this.qrAttempts >= this.maxQRAttempts) {
          logger.error('❌ Muitas tentativas falhas. Aguarde 10 minutos antes de tentar novamente.');
          this.qrAttempts = 0;
          
          // 🆕 Limpar sessão corrompida automaticamente
          await this.clearCorruptedSession();
          
          throw new Error('Muitas tentativas de conexão. Aguarde 10 minutos e tente escanear o QR Code novamente.');
        }
        
        throw new Error('WhatsApp bloqueou temporariamente novas conexões. Aguarde 5-10 minutos e tente novamente.');
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
      this.saveCooldownState();
      
      this.qrCode = await QRCode.toDataURL(qr);
      logger.info('📱 QR Code gerado - Aguardando pareamento...');
      logger.info('⚠️  IMPORTANTE: Escaneie o QR Code UMA VEZ e aguarde conectar');
      logger.info('⚠️  NÃO escaneie múltiplas vezes ou terá erro "can\'t link devices"');
      logger.info('⚠️  Aguarde até 60 segundos após escanear');
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
      logger.error('💡 Solução: Aguarde 5-10 minutos antes de tentar novamente');
      logger.error('💡 IMPORTANTE: Escaneie o QR Code apenas UMA VEZ');
      
      this.isInitializing = false;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.reconnecting = false;
      
      // 🔧 CRÍTICO: Registrar cooldown longo
      this.lastConnectionAttempt = new Date(Date.now() + this.COOLDOWN_AFTER_ERROR - this.MIN_TIME_BETWEEN_ATTEMPTS);
      this.saveCooldownState();
      
      // Limpar sessão corrompida
      await this.clearCorruptedSession();
      
      this.emit('error', { 
        code: 'CANT_LINK_DEVICES',
        message: "can't link devices - Aguarde 5-10 minutos antes de tentar novamente"
      });
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

  // 🔧 MELHORADO: Limpar sessão corrompida com backup
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
          
          // 🆕 Limpar backups antigos (manter apenas os últimos 3)
          this.cleanOldBackups();
        } catch (backupError) {
          logger.warn('⚠️ Não foi possível fazer backup da sessão');
        }
        
        // Remover lock primeiro
        this.removeLockFile();
        
        // Deletar sessão corrompida
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão corrompida removida');
      }
    } catch (error) {
      logger.error('❌ Erro ao limpar sessão:', error);
    }
  }

  // 🆕 Limpar backups antigos
  private cleanOldBackups(): void {
    try {
      const files = fs.readdirSync(this.sessionPath);
      const backups = files
        .filter(f => f.startsWith('session_backup_'))
        .map(f => ({
          name: f,
          time: parseInt(f.replace('session_backup_', ''))
        }))
        .sort((a, b) => b.time - a.time);
      
      // Remover backups além dos 3 mais recentes
      for (let i = 3; i < backups.length; i++) {
        const backupPath = path.join(this.sessionPath, backups[i].name);
        fs.rmSync(backupPath, { recursive: true, force: true });
        logger.info(`🗑️ Backup antigo removido: ${backups[i].name}`);
      }
    } catch (error) {
      logger.warn('⚠️ Erro ao limpar backups antigos:', error);
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting) {
      logger.warn('⚠️  Reconexão já em andamento');
      return;
    }
    
    // 🔧 CRÍTICO: Verificar cooldown antes de agendar reconexão
    const cooldown = this.checkCooldown();
    if (!cooldown.canProceed) {
      logger.error(`🚫 COOLDOWN ATIVO: Reconexão bloqueada. Aguarde ${cooldown.waitSeconds}s`);
      this.reconnecting = false;
      return;
    }
    
    this.reconnecting = true;
    this.reconnectAttempts++;
    this.stats.reconnections++;
    
    // 🔧 CRÍTICO: Backoff mais agressivo para evitar "can't link devices"
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2.5, this.reconnectAttempts - 1), // 🔧 Backoff de 2.5x (era 2x)
      180000 // 🔧 Máximo 3 minutos (era 2)
    );
    
    logger.info(`🔄 Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${Math.round(delay/1000)}s...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error: any) {
        logger.error('❌ Erro na reconexão:', error);
        
        // 🔧 Se for erro "can't link devices", não tentar novamente
        if (error?.message?.includes('can\'t link devices') || 
            error?.message?.includes('Aguarde') ||
            error?.message?.includes('Cooldown')) {
          logger.error('🚫 Reconexão automática desabilitada devido a cooldown');
          this.reconnectAttempts = 0;
        }
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
    
    // 🆕 Resetar cooldowns após conexão bem-sucedida
    // (mas manter um mínimo para evitar loops rápidos)
    this.lastConnectionAttempt = new Date(Date.now() - this.MIN_TIME_BETWEEN_ATTEMPTS + 60000); // Permite nova tentativa em 1 min
    this.saveCooldownState();
    
    if (isNewLogin) {
      logger.info('✅ Baileys conectado! (NOVO LOGIN)');
      logger.info('📱 Dispositivo pareado com sucesso');
    } else {
      logger.info('✅ Baileys conectado! (SESSÃO RESTAURADA)');
      logger.info('🎉 Não é necessário escanear QR Code novamente!');
    }
    
    this.emit('connected');
    
    // 🔧 Aguardar 5 segundos antes de iniciar health check
    await new Promise(resolve => setTimeout(resolve, 5000));
    
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
          const maxWait = 15000;
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
      return false;
    }

    return true;
  }

  async sendTextMessage(phoneNumber: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        phoneNumber,
        text,
        resolve,
        reject,
        timestamp: new Date(),
      });

      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }
    });
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue[0];
      
      // Verificar se mensagem expirou (mais de 5 minutos na fila)
      if (Date.now() - item.timestamp.getTime() > 300000) {
        this.messageQueue.shift();
        item.reject(new Error('Mensagem expirou na fila'));
        continue;
      }

      const isConnected = await this.ensureConnection();
      
      if (!isConnected || !this.sock) {
        logger.warn('⚠️ Não conectado, aguardando para reprocessar fila...');
        break;
      }

      try {
        const jid = this.formatPhoneNumber(item.phoneNumber);
        await this.sock.sendMessage(jid, { text: item.text });
        
        this.messageQueue.shift();
        item.resolve();
        
        this.lastMessageTime = new Date();
        this.stats.messagesSent++;
        
        logger.info(`✅ Mensagem enviada para ${item.phoneNumber}`);
        
        // Aguardar 1 segundo entre mensagens
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        logger.error(`❌ Erro ao enviar mensagem:`, error);
        
        this.messageQueue.shift();
        item.reject(error);
        this.stats.messagesFailed++;
      }
    }

    this.isProcessingQueue = false;
  }

  private clearMessageQueue(reason: string): void {
    const count = this.messageQueue.length;
    if (count > 0) {
      logger.warn(`⚠️ Limpando fila de mensagens (${count} itens): ${reason}`);
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue.shift();
        item?.reject(new Error(`Fila limpa: ${reason}`));
      }
    }
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

  // 🆕 Método para verificar se pode gerar novo QR
  canGenerateQR(): { canGenerate: boolean; waitSeconds: number; reason: string } {
    const cooldown = this.checkCooldown();
    return {
      canGenerate: cooldown.canProceed,
      waitSeconds: cooldown.waitSeconds,
      reason: cooldown.reason
    };
  }

  getStats() {
    const cooldown = this.checkCooldown();
    return {
      ...this.stats,
      isConnected: this.isConnected,
      queueSize: this.messageQueue.length,
      uptime: Date.now() - this.lastMessageTime.getTime(),
      qrAttempts: this.qrAttempts,
      // 🆕 Informações de cooldown
      cooldownActive: !cooldown.canProceed,
      cooldownSeconds: cooldown.waitSeconds,
      cooldownReason: cooldown.reason,
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
    }, 60000); // 🔧 1 minuto (era variável)
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
      if (!this.isConnected) {
        return;
      }

      if (!this.isWebSocketOpen()) {
        logger.warn('⚠️ Health check: WebSocket não está aberto');
        this.connectionLostCount++;
        
        if (this.connectionLostCount >= 3) {
          logger.error('❌ Conexão perdida detectada pelo health check');
          this.isConnected = false;
          
          // 🔧 Verificar cooldown antes de tentar reconectar
          const cooldown = this.checkCooldown();
          if (cooldown.canProceed) {
            await this.scheduleReconnect();
          } else {
            logger.warn(`⚠️ Reconexão adiada: cooldown de ${cooldown.waitSeconds}s`);
          }
        }
      } else {
        this.connectionLostCount = 0;
      }
    }, 45000); // 🔧 45 segundos (era 30)
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
      // 🔧 MELHORADO: Ordem correta de cleanup
      logger.info('🧹 Iniciando cleanup do socket...');
      
      // 1. Remover todos os listeners primeiro
      this.sock.ev.removeAllListeners(undefined);
      
      // 2. Fechar WebSocket
      if (this.sock.ws) {
        try {
          (this.sock.ws as any).close();
          logger.info('✅ WebSocket fechado');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.warn('⚠️ Erro ao fechar WebSocket:', error);
        }
      }
      
      // 3. Encerrar socket
      try {
        this.sock.end(undefined);
        logger.info('✅ Socket encerrado');
      } catch (error) {
        logger.warn('⚠️ Erro ao encerrar socket:', error);
      }
      
      this.sock = null;
      logger.info('✅ Socket limpo completamente');
    } catch (error) {
      logger.error('Erro ao limpar socket:', error);
      this.sock = null;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('🔌 Iniciando desconexão...');
    
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
        // 🔧 CRÍTICO: Fazer logout ANTES de cleanup
        logger.info('🔓 Fazendo logout...');
        await this.sock.logout();
        logger.info('✅ Logout realizado');
      } catch (error) {
        logger.warn('⚠️ Erro ao fazer logout:', error);
      }
      
      // Agora fazer cleanup
      await this.cleanupSocket();
    }
    
    this.isConnected = false;
    this.qrCode = null;
    this.isInitializing = false;
    
    // Remover lock de sessão
    this.removeLockFile();
    
    logger.info('✅ Baileys desconectado completamente');
  }

  async forceNewQR(): Promise<string> {
    logger.info('🔄 [forceNewQR] Solicitação de novo QR Code...');
    
    // 🔧 CRÍTICO: Verificar cooldown
    const cooldown = this.checkCooldown();
    if (!cooldown.canProceed) {
      const message = `Aguarde ${cooldown.waitSeconds} segundos antes de gerar novo QR Code (prevenção "can't link devices")`;
      logger.error(`🚫 COOLDOWN ATIVO: ${message}`);
      throw new Error(message);
    }
    
    // 🔧 Resetar flags
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
    
    // 🔧 Cleanup do socket se existir
    if (this.sock) {
      await this.cleanupSocket();
    }

    const sessionDir = path.join(this.sessionPath, 'session');
  
    try {
      if (fs.existsSync(sessionDir)) {
        // Remover lock primeiro
        this.removeLockFile();
        
        // Fazer backup antes de remover
        const backupDir = path.join(this.sessionPath, `session_backup_${Date.now()}`);
        try {
          fs.cpSync(sessionDir, backupDir, { recursive: true });
          logger.info(`📦 Backup da sessão criado`);
        } catch (e) {
          logger.warn('⚠️ Não foi possível fazer backup');
        }
        
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ Sessão removida');
      }
      
      // 🔧 CRÍTICO: Aguardar 10 segundos após remover sessão
      logger.info('⏳ Aguardando 10s para estabilizar...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
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
          setTimeout(() => reject(new Error('Timeout ao gerar QR Code (60s)')), 60000)
        )
      ]);
    } catch (error: any) {
      logger.error('❌ Erro ao inicializar:', error?.message);
      this.isInitializing = false;
      this.reconnecting = false;
      
      if (error?.message?.includes('can\'t link devices') || error?.message?.includes('Aguarde')) {
        throw new Error('WhatsApp bloqueou temporariamente. Aguarde 5-10 minutos e tente novamente.');
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
        reject(new Error('Timeout ao gerar QR Code (60s). Tente novamente.'));
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
      
      const errorListener = (error: any) => {
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

  // 🔧 Remover arquivo de lock
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