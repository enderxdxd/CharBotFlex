import { Router } from 'express';
import { db, collections } from '../config/firebase.js';
import { getWhatsAppManager } from '../services/whatsapp/whatsapp.manager.js';
import logger from '../utils/logger.js';
import { generateId } from '../utils/helpers.js';

const router = Router();

// ========================================
// HELPER DE VALIDAÇÃO
// ========================================

const validateRequired = (fields: string[], body: any) => {
  const missing = fields.filter(field => !body[field]);
  if (missing.length > 0) {
    return `Campos obrigatórios faltando: ${missing.join(', ')}`;
  }
  return null;
};

// ========================================
// MIDDLEWARE DE AUTENTICAÇÃO (API KEY)
// ========================================

const authenticateApiKey = (req: any, res: any, next: any) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      success: false, 
      error: 'API Key não fornecida. Use o header X-API-Key' 
    });
  }
  
  // TODO: Validar API Key no banco de dados
  // Por enquanto, aceitar qualquer key (você deve implementar validação real)
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ 
      success: false, 
      error: 'API Key inválida' 
    });
  }
  
  next();
};

// ========================================
// 1. ENVIAR MENSAGEM
// ========================================

/**
 * POST /api/v1/messages/send
 * Envia uma mensagem via WhatsApp
 * 
 * Body:
 * {
 *   "to": "5562997412888",
 *   "message": "Olá! Como posso ajudar?",
 *   "type": "text" | "image" | "document" | "audio"
 *   "mediaUrl": "https://..." (opcional, para mídia)
 * }
 */
router.post(
  '/messages/send',
  authenticateApiKey,
  async (req, res) => {
    try {
      const { to, message, type = 'text', mediaUrl } = req.body;
      
      // Validação
      const error = validateRequired(['to', 'message'], req.body);
      if (error) {
        return res.status(400).json({ success: false, error });
      }
      
      const whatsappManager = getWhatsAppManager();
      
      // Enviar mensagem
      if (type === 'text') {
        try {
          await whatsappManager.sendMessage(to, message);
        } catch (connectionError: any) {
          if (connectionError.message?.includes('não está conectado')) {
            return res.status(503).json({
              success: false,
              error: 'WhatsApp não está conectado'
            });
          }
          throw connectionError;
        }
      } else {
        // TODO: Implementar envio de mídia
        return res.status(400).json({
          success: false,
          error: 'Envio de mídia ainda não implementado'
        });
      }
      
      logger.info(`📤 Mensagem enviada via API para ${to}`);
      
      res.json({
        success: true,
        data: {
          to,
          message,
          type,
          sentAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Erro ao enviar mensagem via API:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao enviar mensagem'
      });
    }
  }
);

// ========================================
// 2. BUSCAR CONVERSAS
// ========================================

/**
 * GET /api/v1/conversations
 * Lista todas as conversas
 * 
 * Query params:
 * - status: bot | human | waiting | closed
 * - limit: número de resultados (padrão: 50)
 * - offset: paginação
 */
router.get(
  '/conversations',
  authenticateApiKey,
  async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      
      let query = db.collection(collections.conversations)
        .orderBy('lastActivity', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));
      
      if (status) {
        query = query.where('status', '==', status);
      }
      
      const snapshot = await query.get();
      
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString(),
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString(),
        lastActivity: doc.data().lastActivity?.toDate?.()?.toISOString(),
      }));
      
      res.json({
        success: true,
        data: {
          conversations,
          total: conversations.length,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error) {
      logger.error('Erro ao buscar conversas via API:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar conversas'
      });
    }
  }
);

// ========================================
// 3. BUSCAR MENSAGENS DE UMA CONVERSA
// ========================================

/**
 * GET /api/v1/conversations/:id/messages
 * Lista mensagens de uma conversa específica
 * 
 * Query params:
 * - limit: número de mensagens (padrão: 100)
 */
router.get(
  '/conversations/:id/messages',
  authenticateApiKey,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 100 } = req.query;
      
      const snapshot = await db.collection(collections.messages)
        .where('conversationId', '==', id)
        .orderBy('timestamp', 'desc')
        .limit(Number(limit))
        .get();
      
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString(),
      }));
      
      res.json({
        success: true,
        data: {
          conversationId: id,
          messages: messages.reverse(), // Ordem cronológica
          total: messages.length
        }
      });
    } catch (error) {
      logger.error('Erro ao buscar mensagens via API:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar mensagens'
      });
    }
  }
);

// ========================================
// 4. WEBHOOK PARA RECEBER EVENTOS
// ========================================

/**
 * POST /api/v1/webhook
 * Endpoint para receber eventos do CharBotFlex
 * 
 * Eventos:
 * - message:new (nova mensagem recebida)
 * - conversation:updated (conversa atualizada)
 * - conversation:closed (conversa encerrada)
 */
router.post(
  '/webhook',
  authenticateApiKey,
  async (req, res) => {
    try {
      const { event, data } = req.body;
      
      logger.info(`📡 Webhook recebido: ${event}`, data);
      
      // Aqui você pode processar o evento e fazer algo com os dados
      // Por exemplo, enviar para um serviço externo, atualizar banco, etc.
      
      res.json({
        success: true,
        message: 'Webhook recebido com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao processar webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao processar webhook'
      });
    }
  }
);

// ========================================
// 5. STATUS DA CONEXÃO WHATSAPP
// ========================================

/**
 * GET /api/v1/whatsapp/status
 * Verifica status da conexão WhatsApp
 */
router.get(
  '/whatsapp/status',
  authenticateApiKey,
  async (req, res) => {
    try {
      const whatsappManager = getWhatsAppManager();
      
      // Tentar enviar uma mensagem de teste para verificar conexão
      let connected = false;
      try {
        const baileys = whatsappManager.getBaileysService();
        connected = baileys !== null;
      } catch (e) {
        connected = false;
      }
      
      res.json({
        success: true,
        data: {
          connected,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Erro ao verificar status WhatsApp:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar status'
      });
    }
  }
);

// ========================================
// 6. ATUALIZAR STATUS DA CONVERSA
// ========================================

/**
 * PATCH /api/v1/conversations/:id/status
 * Atualiza o status de uma conversa
 * 
 * Body:
 * {
 *   "status": "bot" | "human" | "waiting" | "closed"
 * }
 */
router.patch(
  '/conversations/:id/status',
  authenticateApiKey,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Validação
      if (!['bot', 'human', 'waiting', 'closed'].includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Status inválido. Use: bot, human, waiting ou closed' 
        });
      }
      
      await db.collection(collections.conversations).doc(id).update({
        status,
        updatedAt: new Date(),
      });
      
      logger.info(`✅ Status da conversa ${id} atualizado para ${status}`);
      
      res.json({
        success: true,
        data: {
          conversationId: id,
          status,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Erro ao atualizar status da conversa:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar status'
      });
    }
  }
);

export default router;
