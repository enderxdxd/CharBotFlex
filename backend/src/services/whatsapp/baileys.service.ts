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
  
  // 🔒 CORREÇÃO 1: Prevenir múltiplas inicializações simultâneas
  private isInitializing: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrTimeout: NodeJS.Timeout | null = null;
  
  // 🔧 NOVO: Monitoramento de saúde da conexão
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastMessageTime: Date = new Date();
  private connectionLostCount: number = 0;
  
  // 🔧 NOVO: Keep-alive periódico
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastKeepAlive: Date = new Date();

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
      
      const sessionDir = path.join(this.sessionPath, 'session');
      const { state, saveCreds } = await this.baileys.useMultiFileAuthState(sessionDir);

      const { version } = await this.baileys.fetchLatestBaileysVersion();
      logger.info(`📦 Versão do Baileys: ${version.join('.')}`);

      this.sock = this.baileys.default({
        auth: state,
        printQRInTerminal: true,
        version,
        defaultQueryTimeoutMs: 120000, // 🔧 2 minutos para timeout padrão
        connectTimeoutMs: 120000, // 2 minutos para conectar
        keepAliveIntervalMs: 10000, // 🔧 Keep alive a cada 10s (mais agressivo)
        // 🔧 Configurações de estabilidade melhoradas
        retryRequestDelayMs: 350,
        maxMsgRetryCount: 10,
        getMessage: async () => undefined,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        // 🔧 CRÍTICO: Identificação do navegador mais estável
        browser: this.baileys.Browsers.ubuntu('Chrome'),
        // 🔧 Configurações adicionais para estabilidade
        qrTimeout: 120000, // 2 minutos para QR code
        emitOwnEvents: false,
        shouldIgnoreJid: (jid: string) => jid.endsWith('@broadcast'),
      });

      // 🔒 CRÍTICO: Tratar erros do WebSocket para evitar crash
      if (this.sock.ws) {
        this.sock.ws.on('error', (error: any) => {
          logger.warn('⚠️ WebSocket error (tratado, não vai crashar):', error.message);
          // Não fazer nada - deixar o handler de connection.update lidar com isso
        });

        this.sock.ws.on('close', (code: number, reason: string) => {
          logger.info(`🔌 WebSocket fechado: code=${code}, reason=${reason || 'sem motivo'}`);
          // Não fazer nada - connection.update vai lidar com reconexão
        });
      }

      // 🔒 Tratar erros não capturados do socket
      this.sock.ev.on('error' as any, (error: any) => {
        logger.warn('⚠️ Socket error event (tratado):', error.message);
        // Não propagar o erro - apenas logar
      });

      // Event: Atualização de conexão
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

        // 🔧 Log detalhado de todos os eventos de conexão
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
          logger.info('⏳ Mantenha o socket ativo durante o pareamento');
          this.emit('qr', this.qrCode);
        }

        if (connection === 'close') {
          const err = lastDisconnect?.error as any;
          const statusCode = err?.output?.statusCode;
          const shouldReconnect = statusCode !== this.baileys!.DisconnectReason.loggedOut;

          // 🔒 Tratar 'Stream Errored' como desconexão normal, não erro fatal
          const isStreamError = err?.message?.includes('Stream Errored') || 
                               err?.message?.includes('Connection Closed') ||
                               err?.message?.includes('Connection Terminated');

          if (isStreamError) {
            logger.info('🔌 Conexão perdida (stream error) - Isso é normal, vou reconectar...');
          } else {
            // Log do erro apenas se não for stream error
            logger.warn('⚠️ Conexão fechada:', {
              statusCode,
              message: err?.message,
              shouldReconnect,
              reconnectAttempts: this.reconnectAttempts
            });
          }

          // 🔒 CORREÇÃO 6: Marcar inicialização como concluída
          this.isInitializing = false;

          if (statusCode === this.baileys!.DisconnectReason.loggedOut) {
            logger.warn('⚠️ Usuário fez logout do WhatsApp');
            logger.info('💡 Para reconectar, acesse /whatsapp e escaneie o QR Code');
            this.isConnected = false;
            this.reconnectAttempts = 0;
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
            
            logger.info(`🔄 Reconectando automaticamente (${this.reconnectAttempts}/${this.maxReconnectAttempts}) em ${Math.round(delay/1000)}s...`);
            
            // 🔒 Armazenar timeout para poder cancelar
            this.reconnectTimeout = setTimeout(async () => {
              try {
                logger.info('🚀 Iniciando tentativa de reconexão...');
                await this.initialize();
              } catch (error) {
                logger.error('❌ Erro na reconexão:', error);
                this.reconnecting = false;
              } finally {
                this.reconnecting = false;
              }
            }, delay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.warn('⚠️ Limite de tentativas de reconexão atingido.');
            logger.info('💡 WhatsApp desconectado. Para reconectar, acesse /whatsapp e escaneie o QR Code.');
            logger.info('ℹ️ O servidor continua funcionando normalmente.');
            this.isConnected = false;
            this.reconnectAttempts = 0; // Reset para próxima tentativa manual
            this.emit('disconnected');
          } else {
            logger.info('ℹ️ Conexão fechada sem necessidade de reconexão.');
            this.isConnected = false;
            this.emit('disconnected');
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qrCode = null;
          this.reconnectAttempts = 0; // Reset contador ao conectar
          this.isInitializing = false; // 🔒 Inicialização concluída com sucesso
          this.lastMessageTime = new Date(); // Reset timer
          this.connectionLostCount = 0; // Reset contador de perdas
          
          // ✅ PERSISTÊNCIA: Informar se foi restauração ou novo login
          if (isNewLogin) {
            logger.info('✅ Baileys conectado com sucesso! (NOVO LOGIN)');
            logger.info('📱 Dispositivo pareado pela primeira vez');
          } else {
            logger.info('✅ Baileys conectado com sucesso! (SESSÃO RESTAURADA)');
            logger.info('📱 Sessão anterior restaurada automaticamente');
            logger.info('🎉 Não é necessário escanear QR Code novamente!');
          }
          
          this.emit('connected');
          
          // 🔧 Iniciar health check e keep-alive
          this.startHealthCheck();
          this.startKeepAlive();
        } else if (connection === 'connecting') {
          logger.info('🔄 Conectando ao WhatsApp...');
          logger.info('⏳ Aguardando resposta do servidor WhatsApp...');
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
          
          // 🔧 Atualizar timestamp de última mensagem
          this.lastMessageTime = new Date();
          
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
      this.reconnecting = false; // 🔒 Liberar flag de reconexão também
      logger.error('❌ Erro ao inicializar Baileys:', error);
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

  async sendTextMessage(phoneNumber: string, text: string, retryCount: number = 0) {
    // Verificar se está conectado
    if (!this.sock || !this.isConnected) {
      throw new Error('Baileys não está conectado. Por favor, reconecte o WhatsApp.');
    }

    // Verificar se WebSocket está aberto
    if (this.sock.ws && (this.sock.ws as any).readyState !== 1) {
      logger.warn(`⚠️ WebSocket não está aberto (readyState: ${(this.sock.ws as any).readyState})`);
      this.isConnected = false;
      throw new Error('Conexão WebSocket não está ativa. Tentando reconectar...');
    }

    try {
      const jid = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📤 Enviando mensagem para ${phoneNumber} (JID: ${jid})`);
      logger.info(`📝 Conteúdo: ${text}`);
      
      await this.sock.sendMessage(jid, { text });
      
      logger.info(`✅ Mensagem enviada com sucesso para ${phoneNumber}`);
      this.lastMessageTime = new Date(); // Atualizar timestamp de atividade
    } catch (error: any) {
      logger.error(`❌ Erro ao enviar mensagem para ${phoneNumber}:`, error?.message || error);
      
      // Se erro de conexão fechada e ainda não tentou retry
      if (error?.message?.includes('Connection Closed') && retryCount < 2) {
        logger.warn(`🔄 Tentando reenviar mensagem (tentativa ${retryCount + 1}/2)...`);
        this.isConnected = false;
        
        // Aguardar 2 segundos e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Tentar reconectar se necessário
        if (!this.isConnected && !this.reconnecting && !this.isInitializing) {
          logger.info('🔄 Reconectando antes de reenviar...');
          await this.initialize();
          await new Promise(resolve => setTimeout(resolve, 3000)); // Aguardar conexão estabilizar
        }
        
        // Retry
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

  // 🔧 NOVO: Keep-alive periódico para manter conexão ativa
  private startKeepAlive() {
    // Limpar keep-alive anterior se existir
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    logger.info('💓 Iniciando keep-alive periódico (a cada 2 minutos)');

    // Enviar presença a cada 2 minutos para manter conexão ativa
    this.keepAliveInterval = setInterval(async () => {
      if (!this.isConnected || !this.sock) {
        logger.warn('⚠️ Keep-alive: Não conectado, pulando...');
        return;
      }

      // Verificar se WebSocket está aberto
      if (this.sock.ws && (this.sock.ws as any).readyState === 1) {
        try {
          // Enviar presença "available" para manter conexão
          await this.sock.sendPresenceUpdate('available');
          this.lastKeepAlive = new Date();
          logger.info('💓 Keep-alive enviado com sucesso');
        } catch (error: any) {
          logger.warn('⚠️ Erro no keep-alive:', error?.message || error);
          // Se falhar, o health check vai detectar e reconectar
        }
      } else {
        logger.warn('⚠️ Keep-alive: WebSocket não está aberto');
        this.isConnected = false;
      }
    }, 120000); // A cada 2 minutos
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.info('💓 Keep-alive parado');
    }
  }

  // 🔧 NOVO: Monitoramento de saúde da conexão
  private startHealthCheck() {
    // Limpar health check anterior se existir
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('🏥 Iniciando monitoramento de saúde da conexão Baileys');

    // Verificar saúde a cada 30 segundos
    this.healthCheckInterval = setInterval(async () => {
      const now = new Date();
      const timeSinceLastMessage = now.getTime() - this.lastMessageTime.getTime();
      const minutesSinceLastMessage = Math.floor(timeSinceLastMessage / 60000);
      const timeSinceLastKeepAlive = now.getTime() - this.lastKeepAlive.getTime();
      const minutesSinceKeepAlive = Math.floor(timeSinceLastKeepAlive / 60000);

      // Log de saúde
      logger.info(`🏥 Health Check: Conexão ${this.isConnected ? 'ATIVA' : 'INATIVA'} | Última atividade: ${minutesSinceLastMessage}min | Último keep-alive: ${minutesSinceKeepAlive}min`);

      // Se passou mais de 5 minutos sem atividade e está conectado, fazer ping
      if (this.isConnected && timeSinceLastMessage > 300000) { // 5 minutos (reduzido de 10)
        logger.warn('⚠️ Sem atividade há 5+ minutos, verificando conexão...');
        
        // Tentar enviar presença para verificar se está realmente conectado
        if (this.sock && this.sock.ws && (this.sock.ws as any).readyState === 1) { // 1 = OPEN
          try {
            await this.sock.sendPresenceUpdate('available');
            logger.info('✅ Ping de presença enviado com sucesso');
            this.lastMessageTime = new Date(); // Reset timer após ping bem-sucedido
            this.connectionLostCount = 0; // Reset contador
          } catch (error: any) {
            logger.warn('⚠️ Erro ao enviar ping de presença (conexão pode estar caindo):', error?.message || error);
            this.connectionLostCount++;
            
            // Se falhou 3 vezes, tentar reconectar
            if (this.connectionLostCount >= 3) {
              logger.error('❌ Conexão perdida detectada! Tentando reconectar...');
              this.isConnected = false;
              this.connectionLostCount = 0;
              this.initialize().catch(err => {
                logger.error('Erro ao reconectar:', err);
              });
            }
          }
        } else {
          // WebSocket não está aberto
          logger.warn('⚠️ WebSocket não está aberto (readyState: ' + ((this.sock?.ws as any)?.readyState || 'N/A') + '), marcando como desconectado');
          this.isConnected = false;
          this.connectionLostCount = 0;
          
          // 🔧 CORREÇÃO: Resetar flags travadas se WebSocket está morto
          if (this.reconnecting || this.isInitializing) {
            logger.warn('⚠️ Flags de reconexão/inicialização travadas detectadas! Resetando...');
            this.reconnecting = false;
            this.isInitializing = false;
          }
          
          // Tentar reconectar
          logger.info('🔄 Iniciando reconexão automática...');
          this.reconnecting = true; // Marcar como reconectando
          this.initialize().catch(err => {
            logger.error('❌ Erro ao reconectar:', err);
            this.reconnecting = false;
          });
        }
      }
    }, 30000); // A cada 30 segundos
  }

  private stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('🏥 Monitoramento de saúde parado');
    }
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
    
    // 🔧 Parar health check e keep-alive
    this.stopHealthCheck();
    this.stopKeepAlive();

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
    logger.info('🔄 [forceNewQR] Iniciando processo de geração de QR Code...');
    
    // 🔒 Se já está inicializando, forçar reset
    if (this.isInitializing) {
      logger.warn('⚠️ [forceNewQR] Inicialização travada detectada, forçando reset...');
      this.isInitializing = false;
      this.reconnecting = false;
      
      // Aguardar 1 segundo para garantir que processos anteriores terminaram
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 🧹 Limpar todos os timeouts e intervalos
    if (this.qrTimeout) {
      logger.info('🧹 [forceNewQR] Limpando timeout de QR anterior');
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
    if (this.reconnectTimeout) {
      logger.info('🧹 [forceNewQR] Limpando timeout de reconexão');
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // 🔄 Parar health check e keep-alive
    this.stopHealthCheck();
    this.stopKeepAlive();

    // 🔄 Resetar flags e contadores
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.reconnecting = false;
    this.isConnected = false;
    this.connectionLostCount = 0;
    logger.info('🔄 [forceNewQR] Flags e contadores resetados');
    
    // 🔌 Desconectar sessão atual se existir
    if (this.sock) {
      try {
        logger.info('🔌 [forceNewQR] Desconectando sessão anterior...');
        
        // 🔧 CRÍTICO: Fechar WebSocket primeiro
        if (this.sock.ws) {
          try {
            logger.info('🔌 [forceNewQR] Fechando WebSocket...');
            this.sock.ws.close();
            // Aguardar WebSocket fechar completamente
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.info('✅ [forceNewQR] WebSocket fechado');
          } catch (wsError) {
            logger.warn('⚠️ [forceNewQR] Erro ao fechar WebSocket:', wsError);
          }
        }
        
        // Remover listeners específicos
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.removeAllListeners('messages.update');
        
        // Tentar fechar gracefully
        try {
          await Promise.race([
            this.sock.end(undefined),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
          ]);
        } catch (endError) {
          logger.warn('⚠️ [forceNewQR] Timeout ao fechar socket, forçando...');
        }
        
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        logger.info('✅ [forceNewQR] Sessão anterior desconectada');
      } catch (error) {
        logger.error('❌ [forceNewQR] Erro ao desconectar sessão:', error);
        // Forçar limpeza mesmo com erro
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
      }
    }

    // 🗑️ Limpar sessão salva (forçar limpeza completa)
    const sessionDir = path.join(this.sessionPath, 'session');
    logger.info('🗑️ [forceNewQR] Removendo sessão salva...');
    
    try {
      if (fs.existsSync(sessionDir)) {
        // Tentar remover normalmente
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info('✅ [forceNewQR] Sessão removida com sucesso');
      } else {
        logger.info('ℹ️ [forceNewQR] Nenhuma sessão anterior encontrada');
      }
      
      // 🔧 CRÍTICO: Aguardar 3 segundos para WhatsApp liberar a sessão
      logger.info('⏳ [forceNewQR] Aguardando 3s para WhatsApp liberar sessão...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error: any) {
      logger.error('❌ [forceNewQR] Erro ao remover sessão:', error?.message || error);
      
      // Tentar remover arquivos individualmente se falhar
      try {
        if (fs.existsSync(sessionDir)) {
          const files = fs.readdirSync(sessionDir);
          for (const file of files) {
            try {
              fs.unlinkSync(path.join(sessionDir, file));
            } catch (e) {
              // Ignorar erros individuais
            }
          }
          fs.rmdirSync(sessionDir);
          logger.info('✅ [forceNewQR] Sessão removida (método alternativo)');
        }
      } catch (altError) {
        logger.warn('⚠️ [forceNewQR] Não foi possível remover sessão completamente');
        logger.warn('⚠️ [forceNewQR] Continuando mesmo assim...');
      }
    }

    // 🚀 Reinicializar para gerar novo QR Code
    logger.info('🚀 [forceNewQR] Iniciando nova conexão Baileys...');
    
    // Remover listeners antigos do EventEmitter
    this.removeAllListeners('qr');
    this.removeAllListeners('connected');
    this.removeAllListeners('disconnected');
    
    try {
      // Inicializar com timeout
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na inicialização')), 30000)
        )
      ]);
      logger.info('✅ [forceNewQR] Baileys inicializado com sucesso');
    } catch (error: any) {
      logger.error('❌ [forceNewQR] Erro ao inicializar Baileys:', error?.message || error);
      
      // Resetar flags em caso de erro
      this.isInitializing = false;
      this.reconnecting = false;
      
      throw new Error('Falha ao inicializar WhatsApp. ' + (error?.message || 'Verifique os logs do servidor.'));
    }
    
    // ⏳ Aguardar geração do QR Code com timeout de 60 segundos
    logger.info('⏳ [forceNewQR] Aguardando geração do QR Code (timeout: 60s)...');
    
    return new Promise<string>((resolve, reject) => {
      let resolved = false;
      
      // Timeout de 60 segundos
      this.qrTimeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        
        this.qrTimeout = null;
        this.isInitializing = false; // Liberar flag
        
        logger.error('❌ [forceNewQR] Timeout ao gerar QR Code após 60 segundos');
        logger.error('💡 [forceNewQR] Possíveis causas:');
        logger.error('   - Problema de conexão com servidores do WhatsApp');
        logger.error('   - Firewall bloqueando conexão');
        logger.error('   - Porta bloqueada ou proxy interferindo');
        
        reject(new Error('Timeout ao gerar QR Code. Verifique sua conexão e tente novamente em alguns minutos.'));
      }, 60000); // 60 segundos (reduzido de 120)

      // Listener para QR Code gerado
      const qrListener = (qr: string) => {
        if (resolved) return;
        resolved = true;
        
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        
        logger.info('✅ [forceNewQR] QR Code gerado com sucesso!');
        resolve(qr);
      };
      
      // Listener para desconexão
      const disconnectListener = () => {
        if (resolved) return;
        resolved = true;
        
        if (this.qrTimeout) {
          clearTimeout(this.qrTimeout);
          this.qrTimeout = null;
        }
        
        this.isInitializing = false; // Liberar flag
        
        logger.error('❌ [forceNewQR] Desconectado antes de gerar QR Code');
        reject(new Error('Conexão perdida antes de gerar QR Code. Tente novamente.'));
      };
      
      // Registrar listeners
      this.once('qr', qrListener);
      this.once('disconnected', disconnectListener);
      
      // Cleanup: remover listeners após resolver/rejeitar
      const cleanup = () => {
        this.removeListener('qr', qrListener);
        this.removeListener('disconnected', disconnectListener);
      };
      
      // Adicionar cleanup em ambos os casos
      const originalResolve = resolve;
      const originalReject = reject;
      
      resolve = ((value: any) => {
        cleanup();
        originalResolve(value);
      }) as any;
      
      reject = ((reason: any) => {
        cleanup();
        originalReject(reason);
      }) as any;
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