import { db, collections } from '../config/firebase.js';
import { IQuickReply, IQuickReplyInput } from '../models/quick-reply.model.js';
import logger from '../utils/logger.js';
import { NotFoundError, ConflictError } from '../utils/AppError.js';

export class QuickReplyService {
  async getAllQuickReplies(filters?: { 
    departmentId?: string;
    userId?: string;
  }): Promise<IQuickReply[]> {
    try {
      let query = db.collection(collections.quickReplies || 'quickReplies');

      // Buscar respostas globais ou do departamento específico
      if (filters?.departmentId) {
        query = query.where('departmentId', '==', filters.departmentId) as any;
      }

      const snapshot = await query.get();
      
      let replies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IQuickReply[];

      // Incluir respostas globais
      if (filters?.departmentId) {
        const globalSnapshot = await db.collection(collections.quickReplies || 'quickReplies')
          .where('isGlobal', '==', true)
          .get();
        
        const globalReplies = globalSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as IQuickReply[];

        replies = [...replies, ...globalReplies];
      }

      return replies;
    } catch (error) {
      logger.error('Erro ao buscar respostas rápidas:', error);
      throw error;
    }
  }

  async getQuickReplyById(id: string): Promise<IQuickReply | null> {
    try {
      const doc = await db.collection(collections.quickReplies || 'quickReplies').doc(id).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as IQuickReply;
    } catch (error) {
      logger.error('Erro ao buscar resposta rápida:', error);
      throw error;
    }
  }

  async getQuickReplyByShortcut(shortcut: string, departmentId?: string): Promise<IQuickReply | null> {
    try {
      let query = db.collection(collections.quickReplies || 'quickReplies')
        .where('shortcut', '==', shortcut);

      if (departmentId) {
        query = query.where('departmentId', '==', departmentId) as any;
      }

      const snapshot = await query.limit(1).get();

      if (snapshot.empty) {
        // Tentar buscar resposta global
        const globalSnapshot = await db.collection(collections.quickReplies || 'quickReplies')
          .where('shortcut', '==', shortcut)
          .where('isGlobal', '==', true)
          .limit(1)
          .get();

        if (globalSnapshot.empty) {
          return null;
        }

        const doc = globalSnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data(),
        } as IQuickReply;
      }

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      } as IQuickReply;
    } catch (error) {
      logger.error('Erro ao buscar resposta rápida por atalho:', error);
      throw error;
    }
  }

  async createQuickReply(replyData: IQuickReplyInput, createdBy: string): Promise<IQuickReply> {
    try {
      // Verificar se já existe um atalho com o mesmo nome
      const existing = await this.getQuickReplyByShortcut(
        replyData.shortcut,
        replyData.departmentId
      );

      if (existing) {
        throw new ConflictError('Já existe uma resposta rápida com este atalho');
      }

      const reply: Omit<IQuickReply, 'id'> = {
        ...replyData,
        tags: replyData.tags || [],
        isGlobal: replyData.isGlobal || false,
        usageCount: 0,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await db.collection(collections.quickReplies || 'quickReplies').add(reply);

      logger.info(`Resposta rápida criada: ${docRef.id}`);

      return {
        id: docRef.id,
        ...reply,
      };
    } catch (error) {
      logger.error('Erro ao criar resposta rápida:', error);
      throw error;
    }
  }

  async updateQuickReply(id: string, updates: Partial<IQuickReplyInput>): Promise<IQuickReply> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await db.collection(collections.quickReplies || 'quickReplies').doc(id).update(updateData);

      const reply = await this.getQuickReplyById(id);

      if (!reply) {
        throw new NotFoundError('Resposta rápida não encontrada');
      }

      logger.info(`Resposta rápida atualizada: ${id}`);

      return reply;
    } catch (error) {
      logger.error('Erro ao atualizar resposta rápida:', error);
      throw error;
    }
  }

  async deleteQuickReply(id: string): Promise<void> {
    try {
      await db.collection(collections.quickReplies || 'quickReplies').doc(id).delete();
      logger.info(`Resposta rápida deletada: ${id}`);
    } catch (error) {
      logger.error('Erro ao deletar resposta rápida:', error);
      throw error;
    }
  }

  async incrementUsageCount(id: string): Promise<void> {
    try {
      const reply = await this.getQuickReplyById(id);
      
      if (reply) {
        await db.collection(collections.quickReplies || 'quickReplies').doc(id).update({
          usageCount: reply.usageCount + 1,
        });
      }
    } catch (error) {
      logger.error('Erro ao incrementar contador de uso:', error);
      throw error;
    }
  }
}
