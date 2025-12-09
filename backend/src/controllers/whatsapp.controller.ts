import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { getWhatsAppManager } from '../services/whatsapp/whatsapp.manager.js';
import { db, collections } from '../config/firebase.js';
import logger from '../utils/logger.js';

export const getHealth = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    // 🆕 Incluir informações de cooldown
    const stats = baileysService?.getStats?.() || {};
    
    res.json({
      success: true,
      data: {
        ready: manager.getConnectionStatus(),
        provider: manager.getCurrentProvider(),
        hasSocket: !!baileysService?.sock,
        reconnectAttempts: baileysService?.reconnectAttempts || 0,
        maxReconnectAttempts: baileysService?.maxReconnectAttempts || 3,
        isInitializing: baileysService?.isInitializing || false,
        reconnecting: baileysService?.reconnecting || false,
        // 🆕 Informações de cooldown
        cooldown: {
          active: stats.cooldownActive || false,
          waitSeconds: stats.cooldownSeconds || 0,
          reason: stats.cooldownReason || '',
        },
        stats: {
          messagesSent: stats.messagesSent || 0,
          messagesFailed: stats.messagesFailed || 0,
          reconnections: stats.reconnections || 0,
          qrAttempts: stats.qrAttempts || 0,
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar health:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar status do WhatsApp',
    });
  }
};

export const getConnections = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const isConnected = manager.getConnectionStatus();
    const provider = manager.getCurrentProvider();

    // Buscar conexões do Firestore
    const connections = [];
    
    if (isConnected && provider === 'baileys') {
      // Buscar vinculação do bot flow
      const connectionDoc = await db.collection('whatsapp_connections').doc('baileys-main').get();
      const connectionData = connectionDoc.exists ? connectionDoc.data() : {};

      // Se tem bot flow vinculado, buscar nome do bot
      let botFlowName = null;
      if (connectionData?.botFlowId) {
        const botFlowDoc = await db.collection(collections.botFlows).doc(connectionData.botFlowId).get();
        if (botFlowDoc.exists) {
          botFlowName = botFlowDoc.data()?.name;
        }
      }

      connections.push({
        id: 'baileys-main',
        phoneNumber: 'WhatsApp Baileys',
        name: 'WhatsApp Principal',
        status: 'connected',
        lastSeen: new Date(),
        botFlowId: connectionData?.botFlowId || null,
        botFlowName: botFlowName,
      });
    }

    res.json({
      success: true,
      data: connections,
    });
  } catch (error) {
    logger.error('Erro ao buscar conexões:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar conexões do WhatsApp',
    });
  }
};

export const generateQrCode = async (req: AuthRequest, res: Response) => {
  try {
    logger.info('🔄 Requisição de QR Code recebida');
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    // Verificar se Baileys está pronto
    const isReady = manager.isBaileysReady();
    logger.info(`📊 Status do Baileys: ${isReady ? 'Conectado' : 'Desconectado'}`);
    
    // Se já está conectado, não precisa gerar QR
    if (isReady) {
      logger.info('✅ WhatsApp já está conectado!');
      return res.json({
        success: true,
        data: {
          qrCode: null,
          message: 'WhatsApp já está conectado',
          connected: true,
        },
      });
    }
    
    // 🆕 Verificar cooldown ANTES de qualquer tentativa
    if (baileysService?.canGenerateQR) {
      const cooldownCheck = baileysService.canGenerateQR();
      if (!cooldownCheck.canGenerate) {
        logger.warn(`🚫 Cooldown ativo: ${cooldownCheck.waitSeconds}s restantes`);
        return res.status(429).json({
          success: false,
          error: `Aguarde ${cooldownCheck.waitSeconds} segundos antes de tentar novamente`,
          code: 'COOLDOWN_ACTIVE',
          data: {
            waitSeconds: cooldownCheck.waitSeconds,
            reason: cooldownCheck.reason,
          }
        });
      }
    }
    
    // Verificar se já está tentando gerar QR
    if (baileysService?.isInitializing) {
      logger.info('⏳ Já está gerando QR Code, aguardando...');
      
      // Aguardar até 15 segundos pelo QR existente
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const qr = manager.getBaileysQRCode();
        if (qr) {
          logger.info('✅ QR Code existente encontrado');
          return res.json({
            success: true,
            data: { qrCode: qr },
          });
        }
        
        // Se conectou enquanto aguardava
        if (manager.isBaileysReady()) {
          return res.json({
            success: true,
            data: {
              qrCode: null,
              message: 'WhatsApp conectado com sucesso',
              connected: true,
            },
          });
        }
      }
      
      // Se ainda não tem QR após 15s e ainda está inicializando
      if (baileysService?.isInitializing) {
        return res.status(202).json({
          success: true,
          data: {
            qrCode: null,
            message: 'Aguardando geração do QR Code. Tente novamente em alguns segundos.',
            pending: true,
          },
        });
      }
    }
    
    // Primeiro tenta pegar QR Code existente
    let qrCode = manager.getBaileysQRCode();

    // Se não tiver QR Code, força geração de novo
    if (!qrCode) {
      logger.info('⚠️ QR Code não disponível, gerando novo...');
      logger.info('🔄 Iniciando processo de geração de QR Code...');
      
      try {
        qrCode = await manager.generateNewQR();
        logger.info('✅ QR Code gerado com sucesso');
      } catch (qrError: any) {
        logger.error('❌ Erro ao gerar QR Code:', qrError);
        
        // 🆕 Verificar se é erro de cooldown
        if (qrError.message?.includes('Aguarde') || 
            qrError.message?.includes('cooldown') ||
            qrError.message?.includes("can't link")) {
          
          // Extrair tempo de espera da mensagem
          const match = qrError.message.match(/(\d+)\s*(segundos?|s)/i);
          const waitSeconds = match ? parseInt(match[1]) : 300;
          
          return res.status(429).json({
            success: false,
            error: qrError.message,
            code: 'COOLDOWN_ACTIVE',
            data: {
              waitSeconds,
              canRetryAt: new Date(Date.now() + waitSeconds * 1000).toISOString(),
            }
          });
        }
        
        // 🔧 NÃO tentar novamente automaticamente - isso causa o problema
        throw qrError;
      }
    } else {
      logger.info('✅ QR Code existente retornado');
    }

    res.json({
      success: true,
      data: {
        qrCode: qrCode,
        // 🆕 Instruções importantes
        instructions: [
          'Escaneie o QR Code apenas UMA VEZ',
          'Aguarde até 60 segundos após escanear',
          'NÃO tente gerar outro QR se este não funcionar imediatamente',
          'Se der erro, aguarde 5-10 minutos antes de tentar novamente'
        ]
      },
    });
  } catch (error: any) {
    logger.error('❌ Erro ao gerar QR Code:', error);
    
    // 🔧 MELHORADO: Mensagens de erro mais específicas
    let errorMessage = 'Não foi possível conectar ao WhatsApp. Tente novamente em alguns instantes.';
    let errorCode = 'UNKNOWN_ERROR';
    let waitSeconds = 0;
    
    if (error.message) {
      if (error.message.includes('Timeout')) {
        errorMessage = 'Tempo esgotado ao conectar com WhatsApp. Verifique sua conexão com a internet e tente novamente.';
        errorCode = 'TIMEOUT';
      } else if (error.message.includes('Conexão perdida')) {
        errorMessage = 'Conexão com WhatsApp foi perdida. Tente novamente.';
        errorCode = 'CONNECTION_LOST';
      } else if (error.message.includes('Falha ao inicializar')) {
        errorMessage = 'Falha ao inicializar WhatsApp. Verifique se o backend está rodando corretamente.';
        errorCode = 'INIT_FAILED';
      } else if (error.message.includes('multidevice') || error.message.includes('dispositivos')) {
        errorMessage = 'Você atingiu o limite de 4 dispositivos vinculados ao WhatsApp. Desconecte um dispositivo no app do WhatsApp (Configurações > Aparelhos conectados) e tente novamente.';
        errorCode = 'MAX_DEVICES';
      } else if (error.message.toLowerCase().includes("can't link") || 
                 error.message.includes('bloqueou')) {
        errorMessage = 'O WhatsApp bloqueou temporariamente novas conexões. Aguarde 5-10 minutos e tente novamente. Isso acontece quando você tenta conectar/desconectar muitas vezes seguidas.';
        errorCode = 'CANT_LINK_DEVICES';
        waitSeconds = 600; // 10 minutos
      } else if (error.message.includes('Aguarde')) {
        errorMessage = error.message;
        errorCode = 'COOLDOWN_ACTIVE';
        const match = error.message.match(/(\d+)\s*(segundos?|s|minutos?|m)/i);
        if (match) {
          waitSeconds = parseInt(match[1]);
          if (match[2].toLowerCase().startsWith('m')) {
            waitSeconds *= 60;
          }
        }
      } else {
        errorMessage = error.message;
      }
    }
    
    const statusCode = errorCode === 'COOLDOWN_ACTIVE' || errorCode === 'CANT_LINK_DEVICES' ? 429 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: errorCode,
      data: waitSeconds > 0 ? {
        waitSeconds,
        canRetryAt: new Date(Date.now() + waitSeconds * 1000).toISOString(),
      } : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

export const disconnectWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const manager = getWhatsAppManager();

    logger.info(`🔌 Desconectando WhatsApp: ${id}`);

    // Desconectar do Baileys usando o manager
    if (id === 'baileys-main') {
      await manager.disconnect();
      
      // Remover vinculação do Firestore
      try {
        await db.collection('whatsapp_connections').doc(id).delete();
        logger.info('🗑️ Vinculação removida do Firestore');
      } catch (dbError) {
        logger.warn('Vinculação não existia no Firestore');
      }
      
      logger.info('✅ WhatsApp desconectado com sucesso');
    }

    res.json({
      success: true,
      message: 'WhatsApp desconectado com sucesso',
      // 🆕 Aviso sobre cooldown
      warning: 'Aguarde pelo menos 5 minutos antes de tentar conectar novamente para evitar bloqueio do WhatsApp.',
    });
  } catch (error) {
    logger.error('Erro ao desconectar WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao desconectar WhatsApp',
    });
  }
};

export const restartWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    // 🆕 Verificar cooldown antes de reiniciar
    if (baileysService?.canGenerateQR) {
      const cooldownCheck = baileysService.canGenerateQR();
      if (!cooldownCheck.canGenerate) {
        return res.status(429).json({
          success: false,
          error: `Aguarde ${cooldownCheck.waitSeconds} segundos antes de reiniciar`,
          code: 'COOLDOWN_ACTIVE',
          data: {
            waitSeconds: cooldownCheck.waitSeconds,
          }
        });
      }
    }
    
    // Reiniciar conexão
    logger.info('Reiniciando WhatsApp...');
    
    // Primeiro desconectar
    await manager.disconnect();
    
    // Aguardar 5 segundos
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Tentar inicializar novamente
    try {
      await manager.initialize();
    } catch (initError: any) {
      logger.warn('⚠️ Erro ao reinicializar:', initError.message);
      // Não falhar aqui, apenas logar
    }
    
    res.json({
      success: true,
      message: 'WhatsApp reiniciado. Aguarde alguns segundos e verifique o status.',
    });
  } catch (error) {
    logger.error('Erro ao reiniciar WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao reiniciar WhatsApp',
    });
  }
};

export const linkBotFlow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { botFlowId } = req.body;

    if (!botFlowId) {
      return res.status(400).json({
        success: false,
        error: 'Bot Flow ID é obrigatório',
      });
    }

    // Verificar se o bot flow existe
    const botFlowDoc = await db.collection(collections.botFlows).doc(botFlowId).get();
    if (!botFlowDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Bot Flow não encontrado',
      });
    }

    // Salvar vinculação no Firestore
    await db.collection('whatsapp_connections').doc(id).set({
      botFlowId,
      botFlowName: botFlowDoc.data()?.name,
      updatedAt: new Date(),
    }, { merge: true });

    logger.info(`✅ Bot Flow ${botFlowId} vinculado ao WhatsApp ${id}`);

    res.json({
      success: true,
      message: 'Bot Flow vinculado com sucesso',
      data: {
        connectionId: id,
        botFlowId,
        botFlowName: botFlowDoc.data()?.name,
      },
    });
  } catch (error) {
    logger.error('Erro ao vincular bot flow:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao vincular bot flow',
    });
  }
};

export const clearSession = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    logger.info('🗑️ Limpando sessão do WhatsApp...');
    
    // Desconectar se estiver conectado
    if (manager.isBaileysReady()) {
      await manager.disconnect();
      logger.info('✅ WhatsApp desconectado');
    }
    
    // Limpar sessão salva
    const sessionPath = process.env.BAILEYS_SESSION_PATH || '/data/baileys_sessions';
    const path = await import('path');
    const fs = await import('fs');
    const sessionDir = path.join(sessionPath, 'session');
    
    if (fs.existsSync(sessionDir)) {
      // 🆕 Criar backup antes de remover
      const backupDir = path.join(sessionPath, `session_backup_${Date.now()}`);
      try {
        fs.cpSync(sessionDir, backupDir, { recursive: true });
        logger.info(`📦 Backup criado: ${backupDir}`);
      } catch (e) {
        logger.warn('⚠️ Não foi possível criar backup');
      }
      
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info('✅ Sessão removida com sucesso');
    } else {
      logger.info('ℹ️ Nenhuma sessão encontrada para remover');
    }
    
    res.json({
      success: true,
      message: 'Sessão limpa com sucesso. Aguarde 5 minutos antes de conectar novamente.',
      // 🆕 Aviso importante
      warning: 'IMPORTANTE: Aguarde pelo menos 5 minutos antes de tentar conectar novamente para evitar o erro "can\'t link devices".',
    });
  } catch (error) {
    logger.error('Erro ao limpar sessão:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao limpar sessão do WhatsApp',
    });
  }
};

// 🆕 Novo endpoint para verificar cooldown
export const checkCooldown = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    if (baileysService?.canGenerateQR) {
      const cooldown = baileysService.canGenerateQR();
      res.json({
        success: true,
        data: {
          canGenerate: cooldown.canGenerate,
          waitSeconds: cooldown.waitSeconds,
          reason: cooldown.reason,
          canRetryAt: cooldown.waitSeconds > 0 
            ? new Date(Date.now() + cooldown.waitSeconds * 1000).toISOString()
            : null,
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          canGenerate: true,
          waitSeconds: 0,
          reason: '',
        }
      });
    }
  } catch (error) {
    logger.error('Erro ao verificar cooldown:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar cooldown',
    });
  }
};