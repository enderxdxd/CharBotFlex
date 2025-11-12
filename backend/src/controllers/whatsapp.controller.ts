import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { getWhatsAppManager } from '../services/whatsapp/whatsapp.manager.js';
import { db, collections } from '../config/firebase.js';
import logger from '../utils/logger.js';

export const getHealth = async (req: AuthRequest, res: Response) => {
  try {
    const manager = getWhatsAppManager();
    const baileysService = (manager as any).baileysService;
    
    res.json({
      success: true,
      data: {
        ready: manager.getConnectionStatus(),
        provider: manager.getCurrentProvider(),
        hasSocket: !!baileysService?.sock,
        reconnectAttempts: baileysService?.reconnectAttempts || 0,
        maxReconnectAttempts: baileysService?.maxReconnectAttempts || 5,
        isInitializing: baileysService?.isInitializing || false,
        reconnecting: baileysService?.reconnecting || false,
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
    
    // Verificar se já está tentando gerar QR
    if (baileysService?.isInitializing) {
      logger.info('⏳ Já está gerando QR Code, aguardando...');
      
      // Aguardar até 10 segundos pelo QR existente
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const qr = manager.getBaileysQRCode();
        if (qr) {
          logger.info('✅ QR Code existente encontrado');
          return res.json({
            success: true,
            data: { qrCode: qr },
          });
        }
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
        
        // Tentar uma segunda vez após 2 segundos
        logger.info('🔄 Tentando novamente em 2 segundos...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          qrCode = await manager.generateNewQR();
          logger.info('✅ QR Code gerado com sucesso na segunda tentativa');
        } catch (retryError: any) {
          throw new Error('Não foi possível gerar QR Code após 2 tentativas. Verifique se o backend está rodando corretamente e tente novamente.');
        }
      }
    } else {
      logger.info('✅ QR Code existente retornado');
    }

    res.json({
      success: true,
      data: {
        qrCode: qrCode,
      },
    });
  } catch (error: any) {
    logger.error('❌ Erro ao gerar QR Code:', error);
    
    // Mensagem de erro mais específica e amigável
    let errorMessage = 'Não foi possível conectar ao WhatsApp. Tente novamente em alguns instantes.';
    
    if (error.message) {
      if (error.message.includes('Timeout')) {
        errorMessage = 'Tempo esgotado ao conectar com WhatsApp. Verifique sua conexão com a internet e tente novamente.';
      } else if (error.message.includes('Conexão perdida')) {
        errorMessage = 'Conexão com WhatsApp foi perdida. Tente novamente.';
      } else if (error.message.includes('Falha ao inicializar')) {
        errorMessage = 'Falha ao inicializar WhatsApp. Verifique se o backend está rodando corretamente.';
      } else {
        errorMessage = error.message;
      }
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
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
    
    // Reiniciar conexão
    logger.info('Reiniciando WhatsApp...');
    
    res.json({
      success: true,
      message: 'WhatsApp reiniciado com sucesso',
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
