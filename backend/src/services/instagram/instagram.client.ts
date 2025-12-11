import axios, { AxiosInstance } from 'axios';
import { db, collections } from '../../config/firebase.js';
import logger from '../../utils/logger.js';
import { IInstagramConfig } from '../../types/index.js';

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class InstagramClient {
  private static instance: InstagramClient;
  private axiosInstance: AxiosInstance;
  private config: IInstagramConfig | null = null;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: GRAPH_API_BASE_URL,
      timeout: 30000,
    });
  }

  static getInstance(): InstagramClient {
    if (!InstagramClient.instance) {
      InstagramClient.instance = new InstagramClient();
    }
    return InstagramClient.instance;
  }

  /**
   * Carrega a configuração do Instagram do Firestore
   */
  async loadConfig(): Promise<IInstagramConfig | null> {
    try {
      const snapshot = await db.collection(collections.instagramConfig)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn('📸 Nenhuma configuração ativa do Instagram encontrada');
        return null;
      }

      const doc = snapshot.docs[0];
      this.config = { id: doc.id, ...doc.data() } as IInstagramConfig;
      
      logger.info(`📸 Configuração do Instagram carregada: @${this.config.instagramUsername || this.config.instagramAccountId}`);
      return this.config;
    } catch (error) {
      logger.error('❌ Erro ao carregar configuração do Instagram:', error);
      return null;
    }
  }

  /**
   * Retorna a configuração atual
   */
  getConfig(): IInstagramConfig | null {
    return this.config;
  }

  /**
   * Verifica se o Instagram está configurado e ativo
   */
  isConfigured(): boolean {
    return this.config !== null && this.config.isActive;
  }

  /**
   * Envia uma mensagem de texto para um usuário do Instagram
   */
  async sendTextMessage(recipientId: string, text: string): Promise<boolean> {
    if (!this.config) {
      logger.error('❌ Instagram não configurado');
      return false;
    }

    try {
      const response = await this.axiosInstance.post(
        `/${this.config.pageId}/messages`,
        {
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE',
        },
        {
          params: { access_token: this.config.accessToken },
        }
      );

      logger.info(`📸 Mensagem enviada para Instagram ${recipientId}: ${text.substring(0, 50)}...`);
      return true;
    } catch (error: any) {
      logger.error('❌ Erro ao enviar mensagem Instagram:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Envia uma imagem para um usuário do Instagram
   */
  async sendImage(recipientId: string, imageUrl: string): Promise<boolean> {
    if (!this.config) {
      logger.error('❌ Instagram não configurado');
      return false;
    }

    try {
      await this.axiosInstance.post(
        `/${this.config.pageId}/messages`,
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'image',
              payload: { url: imageUrl, is_reusable: true },
            },
          },
          messaging_type: 'RESPONSE',
        },
        {
          params: { access_token: this.config.accessToken },
        }
      );

      logger.info(`📸 Imagem enviada para Instagram ${recipientId}`);
      return true;
    } catch (error: any) {
      logger.error('❌ Erro ao enviar imagem Instagram:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Envia um template de botões (Quick Replies)
   */
  async sendQuickReplies(
    recipientId: string,
    text: string,
    options: { title: string; payload: string }[]
  ): Promise<boolean> {
    if (!this.config) {
      logger.error('❌ Instagram não configurado');
      return false;
    }

    try {
      const quickReplies = options.map((opt) => ({
        content_type: 'text',
        title: opt.title.substring(0, 20), // Limite de 20 caracteres
        payload: opt.payload,
      }));

      await this.axiosInstance.post(
        `/${this.config.pageId}/messages`,
        {
          recipient: { id: recipientId },
          message: {
            text,
            quick_replies: quickReplies,
          },
          messaging_type: 'RESPONSE',
        },
        {
          params: { access_token: this.config.accessToken },
        }
      );

      logger.info(`📸 Quick replies enviados para Instagram ${recipientId}`);
      return true;
    } catch (error: any) {
      logger.error('❌ Erro ao enviar quick replies Instagram:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Busca informações do perfil de um usuário do Instagram
   */
  async getUserProfile(userId: string): Promise<{ name: string; profilePic?: string } | null> {
    if (!this.config) {
      return null;
    }

    try {
      const response = await this.axiosInstance.get(`/${userId}`, {
        params: {
          fields: 'name,profile_pic',
          access_token: this.config.accessToken,
        },
      });

      return {
        name: response.data.name || 'Usuário Instagram',
        profilePic: response.data.profile_pic,
      };
    } catch (error: any) {
      logger.warn(`⚠️ Não foi possível obter perfil do usuário ${userId}:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Marca mensagens como lidas
   */
  async markAsSeen(senderId: string): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    try {
      await this.axiosInstance.post(
        `/${this.config.pageId}/messages`,
        {
          recipient: { id: senderId },
          sender_action: 'mark_seen',
        },
        {
          params: { access_token: this.config.accessToken },
        }
      );
      return true;
    } catch (error) {
      // Não logar erro, pois mark_seen pode falhar silenciosamente
      return false;
    }
  }

  /**
   * Mostra indicador de digitação
   */
  async sendTypingOn(recipientId: string): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    try {
      await this.axiosInstance.post(
        `/${this.config.pageId}/messages`,
        {
          recipient: { id: recipientId },
          sender_action: 'typing_on',
        },
        {
          params: { access_token: this.config.accessToken },
        }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Valida o token de acesso
   */
  async validateToken(): Promise<{ valid: boolean; error?: string }> {
    if (!this.config) {
      return { valid: false, error: 'Configuração não carregada' };
    }

    try {
      const response = await this.axiosInstance.get('/debug_token', {
        params: {
          input_token: this.config.accessToken,
          access_token: this.config.accessToken,
        },
      });

      const data = response.data.data;
      if (data.is_valid) {
        return { valid: true };
      } else {
        return { valid: false, error: data.error?.message || 'Token inválido' };
      }
    } catch (error: any) {
      return { valid: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Troca um token de curta duração por um de longa duração
   */
  async exchangeForLongLivedToken(shortLivedToken: string, appId: string, appSecret: string): Promise<string | null> {
    try {
      const response = await this.axiosInstance.get('/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
      });

      return response.data.access_token;
    } catch (error: any) {
      logger.error('❌ Erro ao trocar token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Obtém o Page Access Token a partir do User Access Token
   */
  async getPageAccessToken(userAccessToken: string, pageId: string): Promise<string | null> {
    try {
      const response = await this.axiosInstance.get(`/${pageId}`, {
        params: {
          fields: 'access_token',
          access_token: userAccessToken,
        },
      });

      return response.data.access_token;
    } catch (error: any) {
      logger.error('❌ Erro ao obter Page Access Token:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Lista páginas do Facebook conectadas ao usuário
   */
  async listPages(userAccessToken: string): Promise<{ id: string; name: string; instagram_business_account?: { id: string } }[]> {
    try {
      const response = await this.axiosInstance.get('/me/accounts', {
        params: {
          fields: 'id,name,instagram_business_account',
          access_token: userAccessToken,
        },
      });

      return response.data.data || [];
    } catch (error: any) {
      logger.error('❌ Erro ao listar páginas:', error.response?.data || error.message);
      return [];
    }
  }
}

export default InstagramClient.getInstance();
