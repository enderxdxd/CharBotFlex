import { db, collections } from '../../config/firebase.js';
import logger from '../../utils/logger.js';
import instagramClient from './instagram.client.js';
import { IInstagramConfig } from '../../types/index.js';
import { generateId } from '../../utils/helpers.js';
import crypto from 'crypto';

export class InstagramService {
  /**
   * Salva ou atualiza a configuração do Instagram
   */
  async saveConfig(config: Partial<IInstagramConfig>): Promise<IInstagramConfig> {
    try {
      // Verificar se já existe uma configuração
      const existingSnapshot = await db.collection(collections.instagramConfig).limit(1).get();

      let configId: string;
      let webhookVerifyToken = config.webhookVerifyToken;

      // Gerar verify token se não existir
      if (!webhookVerifyToken) {
        webhookVerifyToken = crypto.randomBytes(32).toString('hex');
      }

      const configData = {
        pageId: config.pageId || '',
        instagramAccountId: config.instagramAccountId || '',
        accessToken: config.accessToken || '',
        pageName: config.pageName || '',
        instagramUsername: config.instagramUsername || '',
        isActive: config.isActive ?? false,
        webhookVerifyToken,
        updatedAt: new Date(),
      };

      if (!existingSnapshot.empty) {
        // Atualizar configuração existente
        configId = existingSnapshot.docs[0].id;
        await db.collection(collections.instagramConfig).doc(configId).update(configData);
        logger.info(`📸 Configuração do Instagram atualizada: ${configId}`);
      } else {
        // Criar nova configuração
        configId = generateId();
        await db.collection(collections.instagramConfig).doc(configId).set({
          ...configData,
          createdAt: new Date(),
        });
        logger.info(`📸 Nova configuração do Instagram criada: ${configId}`);
      }

      // Recarregar configuração no cliente
      await instagramClient.loadConfig();

      return {
        id: configId,
        ...configData,
        createdAt: new Date(),
      } as IInstagramConfig;
    } catch (error) {
      logger.error('❌ Erro ao salvar configuração do Instagram:', error);
      throw error;
    }
  }

  /**
   * Obtém a configuração atual do Instagram
   */
  async getConfig(): Promise<IInstagramConfig | null> {
    try {
      const snapshot = await db.collection(collections.instagramConfig).limit(1).get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as IInstagramConfig;
    } catch (error) {
      logger.error('❌ Erro ao obter configuração do Instagram:', error);
      throw error;
    }
  }

  /**
   * Ativa ou desativa a integração do Instagram
   */
  async setActive(isActive: boolean): Promise<void> {
    try {
      const snapshot = await db.collection(collections.instagramConfig).limit(1).get();

      if (snapshot.empty) {
        throw new Error('Configuração do Instagram não encontrada');
      }

      await db.collection(collections.instagramConfig).doc(snapshot.docs[0].id).update({
        isActive,
        updatedAt: new Date(),
      });

      // Recarregar configuração
      await instagramClient.loadConfig();

      logger.info(`📸 Instagram ${isActive ? 'ativado' : 'desativado'}`);
    } catch (error) {
      logger.error('❌ Erro ao alterar status do Instagram:', error);
      throw error;
    }
  }

  /**
   * Valida as credenciais do Instagram
   */
  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      await instagramClient.loadConfig();
      return await instagramClient.validateToken();
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Conecta uma página do Facebook/Instagram
   * Fluxo: User Access Token -> Page Access Token -> Salvar config
   */
  async connectPage(
    userAccessToken: string,
    pageId: string,
    appId: string,
    appSecret: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Trocar por token de longa duração
      const longLivedToken = await instagramClient.exchangeForLongLivedToken(
        userAccessToken,
        appId,
        appSecret
      );

      if (!longLivedToken) {
        return { success: false, error: 'Falha ao obter token de longa duração' };
      }

      // 2. Obter Page Access Token
      const pageAccessToken = await instagramClient.getPageAccessToken(longLivedToken, pageId);

      if (!pageAccessToken) {
        return { success: false, error: 'Falha ao obter token da página' };
      }

      // 3. Listar páginas para obter informações
      const pages = await instagramClient.listPages(longLivedToken);
      const page = pages.find((p) => p.id === pageId);

      if (!page) {
        return { success: false, error: 'Página não encontrada' };
      }

      if (!page.instagram_business_account) {
        return { success: false, error: 'Página não possui conta Instagram Business vinculada' };
      }

      // 4. Salvar configuração
      await this.saveConfig({
        pageId,
        instagramAccountId: page.instagram_business_account.id,
        accessToken: pageAccessToken,
        pageName: page.name,
        isActive: true,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('❌ Erro ao conectar página:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Desconecta a integração do Instagram
   */
  async disconnect(): Promise<void> {
    try {
      const snapshot = await db.collection(collections.instagramConfig).limit(1).get();

      if (!snapshot.empty) {
        await db.collection(collections.instagramConfig).doc(snapshot.docs[0].id).delete();
      }

      logger.info('📸 Instagram desconectado');
    } catch (error) {
      logger.error('❌ Erro ao desconectar Instagram:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do Instagram
   */
  async getStats(): Promise<{
    totalConversations: number;
    activeConversations: number;
    messagesLast24h: number;
  }> {
    try {
      // Total de conversas do Instagram
      const totalSnapshot = await db
        .collection(collections.conversations)
        .where('channel', '==', 'instagram')
        .count()
        .get();

      // Conversas ativas
      const activeSnapshot = await db
        .collection(collections.conversations)
        .where('channel', '==', 'instagram')
        .where('status', 'in', ['bot', 'human', 'waiting'])
        .count()
        .get();

      // Mensagens nas últimas 24h
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const messagesSnapshot = await db
        .collection(collections.messages)
        .where('channel', '==', 'instagram')
        .where('timestamp', '>=', yesterday)
        .count()
        .get();

      return {
        totalConversations: totalSnapshot.data().count,
        activeConversations: activeSnapshot.data().count,
        messagesLast24h: messagesSnapshot.data().count,
      };
    } catch (error) {
      logger.error('❌ Erro ao obter estatísticas do Instagram:', error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        messagesLast24h: 0,
      };
    }
  }
}

export default new InstagramService();
