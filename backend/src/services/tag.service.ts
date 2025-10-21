import { db, collections } from '../config/firebase';
import { ITag, ITagInput } from '../models/tag.model';
import logger from '../utils/logger';
import { NotFoundError, ConflictError } from '../utils/AppError';

export class TagService {
  async getAllTags(filters?: { category?: string }): Promise<ITag[]> {
    try {
      let query = db.collection(collections.tags || 'tags');

      if (filters?.category) {
        query = query.where('category', '==', filters.category) as any;
      }

      const snapshot = await query.get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ITag[];
    } catch (error) {
      logger.error('Erro ao buscar tags:', error);
      throw error;
    }
  }

  async getTagById(id: string): Promise<ITag | null> {
    try {
      const doc = await db.collection(collections.tags || 'tags').doc(id).get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as ITag;
    } catch (error) {
      logger.error('Erro ao buscar tag:', error);
      throw error;
    }
  }

  async createTag(tagData: ITagInput, createdBy: string): Promise<ITag> {
    try {
      // Verificar se já existe uma tag com o mesmo nome
      const existing = await db.collection(collections.tags || 'tags')
        .where('name', '==', tagData.name)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new ConflictError('Já existe uma tag com este nome');
      }

      const tag: Omit<ITag, 'id'> = {
        ...tagData,
        conversationCount: 0,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await db.collection(collections.tags || 'tags').add(tag);

      logger.info(`Tag criada: ${docRef.id}`);

      return {
        id: docRef.id,
        ...tag,
      };
    } catch (error) {
      logger.error('Erro ao criar tag:', error);
      throw error;
    }
  }

  async updateTag(id: string, updates: Partial<ITagInput>): Promise<ITag> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await db.collection(collections.tags || 'tags').doc(id).update(updateData);

      const tag = await this.getTagById(id);

      if (!tag) {
        throw new NotFoundError('Tag não encontrada');
      }

      logger.info(`Tag atualizada: ${id}`);

      return tag;
    } catch (error) {
      logger.error('Erro ao atualizar tag:', error);
      throw error;
    }
  }

  async deleteTag(id: string): Promise<void> {
    try {
      await db.collection(collections.tags || 'tags').doc(id).delete();
      logger.info(`Tag deletada: ${id}`);
    } catch (error) {
      logger.error('Erro ao deletar tag:', error);
      throw error;
    }
  }

  async addTagToConversation(conversationId: string, tagId: string): Promise<void> {
    try {
      const conversationRef = db.collection(collections.conversations).doc(conversationId);
      const conversation = await conversationRef.get();

      if (!conversation.exists) {
        throw new NotFoundError('Conversa não encontrada');
      }

      const currentTags = conversation.data()?.tags || [];
      
      if (!currentTags.includes(tagId)) {
        await conversationRef.update({
          tags: [...currentTags, tagId],
          updatedAt: new Date(),
        });

        // Incrementar contador da tag
        await db.collection(collections.tags || 'tags').doc(tagId).update({
          conversationCount: (await this.getTagById(tagId))!.conversationCount + 1,
        });

        logger.info(`Tag ${tagId} adicionada à conversa ${conversationId}`);
      }
    } catch (error) {
      logger.error('Erro ao adicionar tag à conversa:', error);
      throw error;
    }
  }

  async removeTagFromConversation(conversationId: string, tagId: string): Promise<void> {
    try {
      const conversationRef = db.collection(collections.conversations).doc(conversationId);
      const conversation = await conversationRef.get();

      if (!conversation.exists) {
        throw new NotFoundError('Conversa não encontrada');
      }

      const currentTags = conversation.data()?.tags || [];
      const newTags = currentTags.filter((t: string) => t !== tagId);

      await conversationRef.update({
        tags: newTags,
        updatedAt: new Date(),
      });

      // Decrementar contador da tag
      const tag = await this.getTagById(tagId);
      if (tag && tag.conversationCount > 0) {
        await db.collection(collections.tags || 'tags').doc(tagId).update({
          conversationCount: tag.conversationCount - 1,
        });
      }

      logger.info(`Tag ${tagId} removida da conversa ${conversationId}`);
    } catch (error) {
      logger.error('Erro ao remover tag da conversa:', error);
      throw error;
    }
  }
}
