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
      const phoneNumber = message.from.replace('@s.whatsapp.net', '');
      const content = message.content;

      logger.info(`📨 Mensagem recebida de ${phoneNumber}: ${content}`);

      // Buscar ou criar conversa
      const conversation = await this.getOrCreateConversation(phoneNumber, source);

      // Salvar mensagem
      await this.saveMessage({
        conversationId: conversation.id,
        from: phoneNumber,
        to: 'bot',
        type: message.type || 'text',
        content,
        timestamp: message.timestamp || new Date(),
      });

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
      logger.error('Erro ao processar mensagem:', error);
    }
  }

  private async getOrCreateConversation(phoneNumber: string, source: 'baileys' | 'official') {
    // Buscar conversa existente
    const snapshot = await db.collection(collections.conversations)
      .where('phoneNumber', '==', phoneNumber)
      .where('status', 'in', ['bot', 'human', 'waiting'])
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    // Criar nova conversa
    const conversationId = generateId();
    const conversation = {
      phoneNumber,
      contactName: phoneNumber, // TODO: Buscar nome do contato
      status: 'bot',
      context: {
        stage: 'initial',
        userData: {},
        lastIntent: '',
      },
      tags: [],
      priority: 'medium',
      source,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(collections.conversations).doc(conversationId).set(conversation);

    logger.info(`✅ Nova conversa criada: ${conversationId}`);

    return { id: conversationId, ...conversation };
  }

  private async saveMessage(data: any) {
    const messageId = generateId();
    const message = {
      ...data,
      id: messageId,
      status: 'sent',
    };

    await db.collection(collections.messages).doc(messageId).set(message);

    // Atualizar última mensagem da conversa
    await db.collection(collections.conversations).doc(data.conversationId).update({
      lastMessage: message,
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