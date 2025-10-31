import { db, collections } from '../config/firebase.js';
import { ITransfer } from '../types/index.js';
import { generateId } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export class TransferService {
  async createTransfer(data: {
    conversationId: string;
    fromUser: string;
    toUser?: string;
    reason: string;
  }): Promise<ITransfer> {
    try {
      const transferId = generateId();
      const transfer: ITransfer = {
        id: transferId,
        conversationId: data.conversationId,
        fromUser: data.fromUser,
        toUser: data.toUser,
        reason: data.reason,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection(collections.transfers).doc(transferId).set(transfer);

      logger.info(`Transferência criada: ${transferId}`);
      return transfer;
    } catch (error) {
      logger.error('Erro ao criar transferência:', error);
      throw error;
    }
  }

  async acceptTransfer(transferId: string): Promise<ITransfer> {
    try {
      await db.collection(collections.transfers).doc(transferId).update({
        status: 'accepted',
        updatedAt: new Date(),
      });

      const doc = await db.collection(collections.transfers).doc(transferId).get();
      
      if (!doc.exists) {
        throw new Error('Transferência não encontrada');
      }

      const transfer = { id: doc.id, ...doc.data() } as ITransfer;

      logger.info(`Transferência aceita: ${transferId}`);
      return transfer;
    } catch (error) {
      logger.error('Erro ao aceitar transferência:', error);
      throw error;
    }
  }

  async rejectTransfer(transferId: string): Promise<ITransfer> {
    try {
      await db.collection(collections.transfers).doc(transferId).update({
        status: 'rejected',
        updatedAt: new Date(),
      });

      const doc = await db.collection(collections.transfers).doc(transferId).get();
      
      if (!doc.exists) {
        throw new Error('Transferência não encontrada');
      }

      const transfer = { id: doc.id, ...doc.data() } as ITransfer;

      logger.info(`Transferência rejeitada: ${transferId}`);
      return transfer;
    } catch (error) {
      logger.error('Erro ao rejeitar transferência:', error);
      throw error;
    }
  }

  async getPendingTransfers(userId?: string): Promise<ITransfer[]> {
    try {
      let query = db.collection(collections.transfers)
        .where('status', '==', 'pending');

      if (userId) {
        query = query.where('toUser', '==', userId);
      }

      const snapshot = await query.get();
      
      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      })) as ITransfer[];
    } catch (error) {
      logger.error('Erro ao buscar transferências pendentes:', error);
      throw error;
    }
  }
}
