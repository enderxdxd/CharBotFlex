import { Request, Response } from 'express';
import instagramService from '../services/instagram/instagram.service.js';
import instagramWebhook from '../services/instagram/instagram.webhook.js';
import instagramHandler from '../services/instagram/instagram.handler.js';
import logger from '../utils/logger.js';

export class InstagramController {
  /**
   * GET /api/instagram/webhook - Verificação do webhook pelo Facebook
   */
  async verifyWebhook(req: Request, res: Response): Promise<void> {
    await instagramWebhook.verifyWebhook(req, res);
  }

  /**
   * POST /api/instagram/webhook - Recebe eventos do Instagram
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    await instagramWebhook.handleWebhook(req, res);
  }

  /**
   * GET /api/instagram/config - Obtém configuração do Instagram
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await instagramService.getConfig();
      
      if (!config) {
        res.json({
          success: true,
          data: null,
          message: 'Instagram não configurado',
        });
        return;
      }

      // Não retornar o token completo por segurança
      res.json({
        success: true,
        data: {
          id: config.id,
          pageId: config.pageId,
          instagramAccountId: config.instagramAccountId,
          pageName: config.pageName,
          instagramUsername: config.instagramUsername,
          isActive: config.isActive,
          webhookVerifyToken: config.webhookVerifyToken,
          hasAccessToken: !!config.accessToken,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      });
    } catch (error: any) {
      logger.error('❌ Erro ao obter configuração do Instagram:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/instagram/config - Salva configuração do Instagram
   */
  async saveConfig(req: Request, res: Response): Promise<void> {
    try {
      const {
        pageId,
        instagramAccountId,
        accessToken,
        pageName,
        instagramUsername,
        isActive,
      } = req.body;

      const config = await instagramService.saveConfig({
        pageId,
        instagramAccountId,
        accessToken,
        pageName,
        instagramUsername,
        isActive,
      });

      res.json({
        success: true,
        data: {
          id: config.id,
          pageId: config.pageId,
          instagramAccountId: config.instagramAccountId,
          pageName: config.pageName,
          instagramUsername: config.instagramUsername,
          isActive: config.isActive,
          webhookVerifyToken: config.webhookVerifyToken,
        },
        message: 'Configuração salva com sucesso',
      });
    } catch (error: any) {
      logger.error('❌ Erro ao salvar configuração do Instagram:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/instagram/connect - Conecta uma página do Facebook/Instagram
   */
  async connectPage(req: Request, res: Response): Promise<void> {
    try {
      const { userAccessToken, pageId, appId, appSecret } = req.body;

      if (!userAccessToken || !pageId || !appId || !appSecret) {
        res.status(400).json({
          success: false,
          error: 'Parâmetros obrigatórios: userAccessToken, pageId, appId, appSecret',
        });
        return;
      }

      const result = await instagramService.connectPage(
        userAccessToken,
        pageId,
        appId,
        appSecret
      );

      if (result.success) {
        res.json({
          success: true,
          message: 'Página conectada com sucesso',
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      logger.error('❌ Erro ao conectar página:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/instagram/disconnect - Desconecta o Instagram
   */
  async disconnect(req: Request, res: Response): Promise<void> {
    try {
      await instagramService.disconnect();
      res.json({
        success: true,
        message: 'Instagram desconectado com sucesso',
      });
    } catch (error: any) {
      logger.error('❌ Erro ao desconectar Instagram:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/instagram/toggle - Ativa/desativa o Instagram
   */
  async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Parâmetro isActive (boolean) é obrigatório',
        });
        return;
      }

      await instagramService.setActive(isActive);
      res.json({
        success: true,
        message: `Instagram ${isActive ? 'ativado' : 'desativado'} com sucesso`,
      });
    } catch (error: any) {
      logger.error('❌ Erro ao alterar status do Instagram:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/instagram/validate - Valida as credenciais do Instagram
   */
  async validateCredentials(req: Request, res: Response): Promise<void> {
    try {
      const result = await instagramService.validateCredentials();
      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('❌ Erro ao validar credenciais:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/instagram/stats - Obtém estatísticas do Instagram
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await instagramService.getStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('❌ Erro ao obter estatísticas:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/instagram/send - Envia mensagem manual para o Instagram
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId, content } = req.body;
      const operatorId = (req as any).user?.uid || 'operator';

      if (!conversationId || !content) {
        res.status(400).json({
          success: false,
          error: 'Parâmetros obrigatórios: conversationId, content',
        });
        return;
      }

      const success = await instagramHandler.sendOperatorMessage(
        conversationId,
        content,
        operatorId
      );

      if (success) {
        res.json({
          success: true,
          message: 'Mensagem enviada com sucesso',
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Falha ao enviar mensagem',
        });
      }
    } catch (error: any) {
      logger.error('❌ Erro ao enviar mensagem:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new InstagramController();
