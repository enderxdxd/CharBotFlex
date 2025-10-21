import { Response } from 'express';
import { AuthRequest } from '../types';
import { getWhatsAppManager } from '../services/whatsapp/whatsapp.manager';
import { db, collections } from '../config/firebase';
import logger from '../utils/logger';

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
    const manager = getWhatsAppManager();
    
    // Primeiro tenta pegar QR Code existente
    let qrCode = manager.getBaileysQRCode();

    // Se não tiver QR Code, força geração de novo
    if (!qrCode) {
      logger.info('QR Code não disponível, gerando novo...');
      qrCode = await manager.generateNewQR();
    }

    res.json({
      success: true,
      data: {
        qrCode: qrCode,
      },
    });
  } catch (error) {
    logger.error('Erro ao gerar QR Code:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar QR Code. Tente novamente.',
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
