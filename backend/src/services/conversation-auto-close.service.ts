import { db } from '../config/firebase';
import { IConversation } from '../types';
import { SettingsService } from './settings.service';
import logger from '../utils/logger';

const CONVERSATIONS_COLLECTION = 'conversations';
const WARNING_SENT_FIELD = 'autoCloseWarningSent';

export class ConversationAutoCloseService {
  private settingsService: SettingsService;

  constructor() {
    this.settingsService = new SettingsService();
  }

  /**
   * Verifica e fecha conversas inativas
   */
  async checkAndCloseInactiveConversations(): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings();

      if (!settings.autoClose.enabled) {
        logger.info('⏸️ Auto-fechamento de conversas está desabilitado');
        return;
      }

      const now = new Date();
      const inactivityThreshold = new Date(
        now.getTime() - settings.autoClose.inactivityTimeout * 60 * 1000
      );
      const warningThreshold = new Date(
        now.getTime() - 
        (settings.autoClose.inactivityTimeout - settings.autoClose.warningTimeBeforeClose) * 60 * 1000
      );

      logger.info(`🔍 Verificando conversas inativas desde ${inactivityThreshold.toISOString()}`);

      // Buscar conversas ativas (bot ou human) que não foram atualizadas há muito tempo
      const conversationsSnapshot = await db
        .collection(CONVERSATIONS_COLLECTION)
        .where('status', 'in', ['bot', 'human', 'waiting'])
        .where('updatedAt', '<', inactivityThreshold)
        .get();

      if (conversationsSnapshot.empty) {
        logger.info('✅ Nenhuma conversa inativa encontrada');
        return;
      }

      logger.info(`📋 Encontradas ${conversationsSnapshot.size} conversas inativas`);

      let closedCount = 0;
      let warningsSent = 0;

      for (const doc of conversationsSnapshot.docs) {
        const conversation = { id: doc.id, ...doc.data() } as IConversation & { 
          autoCloseWarningSent?: boolean;
          autoCloseWarningAt?: Date;
        };

        // Verificar se deve fechar a conversa
        const updatedAt = conversation.updatedAt instanceof Date 
          ? conversation.updatedAt 
          : (conversation.updatedAt as any).toDate();
        
        if (updatedAt < inactivityThreshold) {
          await this.closeConversation(conversation, settings.autoClose.closureMessage);
          closedCount++;
        }
      }

      // Buscar conversas que precisam receber aviso
      if (settings.autoClose.sendWarningMessage) {
        const conversationsForWarningSnapshot = await db
          .collection(CONVERSATIONS_COLLECTION)
          .where('status', 'in', ['bot', 'human', 'waiting'])
          .where('updatedAt', '<', warningThreshold)
          .where('updatedAt', '>=', inactivityThreshold)
          .where(WARNING_SENT_FIELD, '==', false)
          .get();

        for (const doc of conversationsForWarningSnapshot.docs) {
          const conversation = { id: doc.id, ...doc.data() } as IConversation;
          await this.sendWarningMessage(
            conversation,
            settings.autoClose.warningTimeBeforeClose
          );
          warningsSent++;
        }
      }

      logger.info(`✅ Auto-fechamento concluído: ${closedCount} conversas fechadas, ${warningsSent} avisos enviados`);
    } catch (error) {
      logger.error('❌ Erro ao verificar conversas inativas:', error);
      throw error;
    }
  }

  /**
   * Fecha uma conversa por inatividade
   */
  private async closeConversation(
    conversation: IConversation,
    closureMessage: string
  ): Promise<void> {
    try {
      const batch = db.batch();

      // Atualizar status da conversa
      const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversation.id);
      batch.update(conversationRef, {
        status: 'closed',
        closedReason: 'inactivity',
        closedAt: new Date(),
        updatedAt: new Date(),
      });

      // Criar mensagem de fechamento
      const messageRef = db.collection('messages').doc();
      batch.set(messageRef, {
        conversationId: conversation.id,
        from: 'system',
        to: conversation.phoneNumber,
        type: 'text',
        content: closureMessage,
        timestamp: new Date(),
        status: 'sent',
        isSystemMessage: true,
      });

      await batch.commit();

      logger.info(`🔒 Conversa ${conversation.id} fechada por inatividade`);

      // Enviar mensagem via WhatsApp (se houver serviço de mensagens)
      await this.sendWhatsAppMessage(conversation.phoneNumber, closureMessage);
    } catch (error) {
      logger.error(`❌ Erro ao fechar conversa ${conversation.id}:`, error);
      throw error;
    }
  }

  /**
   * Envia mensagem de aviso antes de fechar
   */
  private async sendWarningMessage(
    conversation: IConversation,
    minutesBeforeClose: number
  ): Promise<void> {
    try {
      const warningMessage = `⚠️ Atenção: Este atendimento será encerrado automaticamente em ${minutesBeforeClose} minutos devido à inatividade. Se precisar de ajuda, por favor responda esta mensagem.`;

      // Atualizar flag de aviso enviado
      await db.collection(CONVERSATIONS_COLLECTION).doc(conversation.id).update({
        [WARNING_SENT_FIELD]: true,
        autoCloseWarningAt: new Date(),
        updatedAt: new Date(), // Não atualizar updatedAt para não resetar o timer
      });

      // Criar mensagem de aviso
      await db.collection('messages').add({
        conversationId: conversation.id,
        from: 'system',
        to: conversation.phoneNumber,
        type: 'text',
        content: warningMessage,
        timestamp: new Date(),
        status: 'sent',
        isSystemMessage: true,
      });

      logger.info(`⚠️ Aviso de fechamento enviado para conversa ${conversation.id}`);

      // Enviar mensagem via WhatsApp
      await this.sendWhatsAppMessage(conversation.phoneNumber, warningMessage);
    } catch (error) {
      logger.error(`❌ Erro ao enviar aviso para conversa ${conversation.id}:`, error);
      throw error;
    }
  }

  /**
   * Envia mensagem via WhatsApp
   * TODO: Integrar com o serviço de mensagens do WhatsApp
   */
  private async sendWhatsAppMessage(phoneNumber: string, message: string): Promise<void> {
    try {
      // Aqui você deve integrar com o serviço de envio de mensagens do WhatsApp
      // Por exemplo, usando Baileys ou API Oficial
      logger.info(`📤 Mensagem enviada para ${phoneNumber}: ${message.substring(0, 50)}...`);
      
      // TODO: Implementar envio real via WhatsApp
      // await whatsappService.sendMessage(phoneNumber, message);
    } catch (error) {
      logger.error(`❌ Erro ao enviar mensagem WhatsApp para ${phoneNumber}:`, error);
      // Não lançar erro para não interromper o processo de fechamento
    }
  }

  /**
   * Reseta o flag de aviso quando há nova atividade
   */
  async resetWarningFlag(conversationId: string): Promise<void> {
    try {
      await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update({
        [WARNING_SENT_FIELD]: false,
        autoCloseWarningAt: null,
      });
    } catch (error) {
      logger.error(`❌ Erro ao resetar flag de aviso para conversa ${conversationId}:`, error);
    }
  }
}
