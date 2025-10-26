import { db, collections } from '../../config/firebase';
import { FlowEngine } from './flow.engine';
// Importação inline para resolver problema de módulo
const { ContextManager } = require('./context.manager');
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';
import { io } from '../../server';

export class MessageHandler {
  private flowEngine: FlowEngine;
  private contextManager: any; // Tipo genérico para resolver problema
  private whatsappManager: any;

  constructor(whatsappManager: any) {
    this.whatsappManager = whatsappManager;
    this.flowEngine = new FlowEngine();
    this.contextManager = new ContextManager();
  }

  async handleIncomingMessage(message: any, source: 'baileys' | 'official') {
    try {
      logger.info('🔔 handleIncomingMessage CHAMADO:', {
        from: message.from,
        content: message.content,
        fromMe: message.fromMe,
        source
      });

      // IMPORTANTE: Ignorar mensagens enviadas pelo próprio bot
      if (message.fromMe || message.key?.fromMe) {
        logger.debug('⏭️ Ignorando mensagem enviada pelo bot');
        return;
      }

      const phoneNumber = message.from.replace('@s.whatsapp.net', '');
      const content = message.content;
      const contactName = message.contactName || phoneNumber;

      logger.info(`📨 Mensagem recebida de ${contactName} (${phoneNumber}): ${content}`);

      // Buscar ou criar conversa
      logger.info('🔍 Buscando ou criando conversa...');
      const conversation = await this.getOrCreateConversation(phoneNumber, contactName, source);
      logger.info(`✅ Conversa obtida: ${conversation.id}`);

      // Salvar mensagem
      logger.info('💾 Salvando mensagem no Firestore...');
      await this.saveMessage({
        conversationId: conversation.id,
        from: phoneNumber,
        to: 'bot',
        type: message.type || 'text',
        content,
        timestamp: message.timestamp || new Date(),
      });
      logger.info('✅ Mensagem salva com sucesso!');

      // Emitir evento via Socket.IO
      io.emit('message:new', {
        conversationId: conversation.id,
        from: phoneNumber,
        content,
        timestamp: new Date(),
      });

      // Processar mensagem baseado no status da conversa
      const conv = conversation as any; // Casting para resolver tipos
      if (conv.status === 'bot') {
        await this.processBotMessage(conversation, content, phoneNumber);
      } else if (conv.status === 'waiting') {
        // Conversa aguardando atendimento humano
        logger.info(`Conversa ${conversation.id} aguardando atendente`);
      } else if (conv.status === 'human') {
        // Conversa em atendimento humano - não processar pelo bot
        logger.info(`Conversa ${conversation.id} em atendimento humano`);
      }
    } catch (error) {
      logger.error('❌ ERRO CRÍTICO ao processar mensagem:', error);
      logger.error('Stack trace:', (error as Error).stack);
    }
  }

  private async getOrCreateConversation(phoneNumber: string, contactName: string, source: 'baileys' | 'official') {
    // Buscar conversa existente
    const snapshot = await db.collection(collections.conversations)
      .where('phoneNumber', '==', phoneNumber)
      .where('status', 'in', ['bot', 'human', 'waiting'])
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      // Atualizar nome do contato se mudou
      if (data.contactName !== contactName && contactName !== phoneNumber) {
        await db.collection(collections.conversations).doc(doc.id).update({
          contactName,
          updatedAt: new Date(),
        });
        logger.info(`📝 Nome do contato atualizado: ${contactName}`);
      }
      
      return { id: doc.id, ...doc.data(), contactName };
    }

    // Criar nova conversa
    const conversationId = generateId();
    const conversation = {
      phoneNumber,
      contactName, // Usar nome do WhatsApp
      status: 'bot',
      context: {
        stage: 'initial',
        userData: {},
        lastIntent: '',
      },
      tags: [],
      priority: 'medium',
      source,
      lastActivity: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(collections.conversations).doc(conversationId).set(conversation);

    logger.info(`✅ Nova conversa criada: ${conversationId} para ${contactName} (${phoneNumber})`);

    return { id: conversationId, ...conversation };
  }

  private async saveMessage(data: any) {
    const messageId = generateId();
    const message = {
      conversationId: data.conversationId,
      senderId: data.from,
      content: data.content,
      type: data.type || 'text',
      timestamp: data.timestamp || new Date(),
      isFromBot: data.from === 'bot',
      isRead: false,
      id: messageId,
      status: 'sent',
    };

    await db.collection(collections.messages).doc(messageId).set(message);

    // Atualizar última mensagem e atividade da conversa
    await db.collection(collections.conversations).doc(data.conversationId).update({
      lastMessage: {
        id: messageId,
        content: data.content,
        timestamp: new Date(),
        isFromBot: data.from === 'bot',
      },
      lastActivity: new Date(),
      updatedAt: new Date(),
    });
  }

  private async processBotMessage(conversation: any, content: string, phoneNumber: string) {
    try {
      // Buscar contexto da conversa
      const context = await this.contextManager.getContext(conversation.id);

      // Processar mensagem pelo Flow Engine
      const response = await this.flowEngine.processMessage(content, context);

      // Atualizar contexto
      await this.contextManager.updateContext(conversation.id, response.context);

      // Enviar resposta
      if (response.message) {
        await this.whatsappManager.sendMessage(phoneNumber, response.message);

        // Salvar resposta do bot
        await this.saveMessage({
          conversationId: conversation.id,
          from: 'bot',
          to: phoneNumber,
          type: 'text',
          content: response.message,
          timestamp: new Date(),
        });
      }

      // Verificar se deve transferir para humano
      if (response.transferToHuman) {
        await this.transferToHuman(conversation.id);
      }
    } catch (error) {
      logger.error('Erro ao processar mensagem do bot:', error);
    }
  }

  private async transferToHuman(conversationId: string) {
    try {
      await db.collection(collections.conversations).doc(conversationId).update({
        status: 'waiting',
        updatedAt: new Date(),
      });

      logger.info(`Conversa ${conversationId} transferida para aguardar atendimento humano`);

      // Emitir evento
      io.emit('conversation:waiting', { conversationId });
    } catch (error) {
      logger.error('Erro ao transferir para humano:', error);
    }
  }
}