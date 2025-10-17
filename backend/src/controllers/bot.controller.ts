import { Response } from 'express';
import { AuthRequest } from '../types';
import { db, collections } from '../config/firebase';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';
import { getWhatsAppManager } from '../services/whatsapp/whatsapp.manager';

const whatsappManager = getWhatsAppManager();

export const getBotFlows = async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await db.collection(collections.botFlows)
      .orderBy('createdAt', 'desc')
      .get();

    const flows = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    logger.error('Erro ao buscar fluxos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar fluxos',
    });
  }
};

export const getBotFlowById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await db.collection(collections.botFlows).doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Fluxo não encontrado',
      });
    }

    res.json({
      success: true,
      data: { id: doc.id, ...doc.data() },
    });
  } catch (error) {
    logger.error('Erro ao buscar fluxo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar fluxo',
    });
  }
};

export const createBotFlow = async (req: AuthRequest, res: Response) => {
  try {
    const { name, trigger, nodes, edges, isActive } = req.body;

    const flowId = generateId();
    const flow = {
      name,
      isActive: isActive || false,
      trigger,
      nodes: nodes || [],
      edges: edges || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(collections.botFlows).doc(flowId).set(flow);

    res.status(201).json({
      success: true,
      data: { id: flowId, ...flow },
      message: 'Fluxo criado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao criar fluxo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar fluxo',
    });
  }
};

export const updateBotFlow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    await db.collection(collections.botFlows).doc(id).update({
      ...updates,
      updatedAt: new Date(),
    });

    const doc = await db.collection(collections.botFlows).doc(id).get();

    res.json({
      success: true,
      data: { id: doc.id, ...doc.data() },
      message: 'Fluxo atualizado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar fluxo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar fluxo',
    });
  }
};

export const deleteBotFlow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await db.collection(collections.botFlows).doc(id).delete();

    res.json({
      success: true,
      message: 'Fluxo deletado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao deletar fluxo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar fluxo',
    });
  }
};

export const toggleBotFlow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await db.collection(collections.botFlows).doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Fluxo não encontrado',
      });
    }

    const flow = doc.data();
    const newStatus = !flow?.isActive;

    await db.collection(collections.botFlows).doc(id).update({
      isActive: newStatus,
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      data: { isActive: newStatus },
      message: `Fluxo ${newStatus ? 'ativado' : 'desativado'} com sucesso`,
    });
  } catch (error) {
    logger.error('Erro ao alternar fluxo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao alternar fluxo',
    });
  }
};

export const getBotStatus = async (req: AuthRequest, res: Response) => {
  try {
    const baileysReady = whatsappManager.isBaileysReady();
    const qrCode = whatsappManager.getBaileysQRCode();

    res.json({
      success: true,
      data: {
        baileys: {
          connected: baileysReady,
          qrCode: qrCode || null,
        },
        officialAPI: {
          configured: !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_ID),
        },
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar status do bot:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar status do bot',
    });
  }
};