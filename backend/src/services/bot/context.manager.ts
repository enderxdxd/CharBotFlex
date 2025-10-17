import { db, collections } from '../../config/firebase';
import { IConversationContext } from '../../types';
import logger from '../../utils/logger';

export class ContextManager {
  async getContext(conversationId: string): Promise<IConversationContext> {
    try {
      const doc = await db.collection(collections.conversations).doc(conversationId).get();
      
      if (!doc.exists) {
        return this.getDefaultContext();
      }

      const conversation = doc.data();
      return conversation?.context || this.getDefaultContext();
    } catch (error) {
      logger.error('Erro ao buscar contexto:', error);
      return this.getDefaultContext();
    }
  }

  async updateContext(conversationId: string, context: IConversationContext): Promise<void> {
    try {
      await db.collection(collections.conversations).doc(conversationId).update({
        context,
        updatedAt: new Date(),
      });

      logger.debug(`Contexto atualizado para conversa ${conversationId}`);
    } catch (error) {
      logger.error('Erro ao atualizar contexto:', error);
      throw error;
    }
  }

  async clearContext(conversationId: string): Promise<void> {
    try {
      const defaultContext = this.getDefaultContext();
      
      await db.collection(collections.conversations).doc(conversationId).update({
        context: defaultContext,
        updatedAt: new Date(),
      });

      logger.info(`Contexto limpo para conversa ${conversationId}`);
    } catch (error) {
      logger.error('Erro ao limpar contexto:', error);
      throw error;
    }
  }

  async saveUserData(conversationId: string, key: string, value: any): Promise<void> {
    try {
      const context = await this.getContext(conversationId);
      
      context.userData[key] = value;
      
      await this.updateContext(conversationId, context);
    } catch (error) {
      logger.error('Erro ao salvar dados do usuário:', error);
      throw error;
    }
  }

  async getUserData(conversationId: string, key: string): Promise<any> {
    try {
      const context = await this.getContext(conversationId);
      return context.userData[key];
    } catch (error) {
      logger.error('Erro ao buscar dados do usuário:', error);
      return null;
    }
  }

  private getDefaultContext(): IConversationContext {
    return {
      stage: 'initial',
      userData: {},
      lastIntent: '',
    };
  }
}
