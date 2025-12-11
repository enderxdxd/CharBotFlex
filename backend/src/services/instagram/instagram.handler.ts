import { db, collections } from '../../config/firebase.js';
import { FlowEngine } from '../bot/flow.engine.js';
import { ContextManager } from '../bot/context.manager.js';
import { generateId } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';
import { io } from '../../server.js';
import instagramClient from './instagram.client.js';
import { IInstagramAttachment, ChannelType } from '../../types/index.js';

interface IncomingInstagramMessage {
  messageId: string;
  senderId: string;      // IGSID do usuário
  pageId: string;
  text?: string;
  attachments?: IInstagramAttachment[];
  timestamp: number;
  isPostback?: boolean;
}

export class InstagramMessageHandler {
  private flowEngine: FlowEngine;
  private contextManager: ContextManager;

  constructor() {
    this.flowEngine = new FlowEngine();
    this.contextManager = new ContextManager();
  }

  /**
   * Processa uma mensagem recebida do Instagram
   */
  async handleIncomingMessage(message: IncomingInstagramMessage): Promise<void> {
    try {
      logger.info('📸 handleIncomingMessage Instagram CHAMADO:', {
        senderId: message.senderId,
        text: message.text,
        hasAttachments: !!message.attachments,
      });

      const senderId = message.senderId;
      const content = message.text || '[Mídia]';

      // Buscar informações do perfil do usuário
      const userProfile = await instagramClient.getUserProfile(senderId);
      const contactName = userProfile?.name || `Instagram ${senderId.substring(0, 8)}`;
      const contactAvatar = userProfile?.profilePic;

      logger.info(`📸 Mensagem recebida de ${contactName} (${senderId}): ${content}`);

      // Buscar ou criar conversa
      const conversation = await this.getOrCreateConversation(
        senderId,
        contactName,
        contactAvatar
      );
      logger.info(`✅ Conversa obtida: ${conversation.id}`);

      // Determinar tipo de mensagem
      let messageType: string = 'text';
      let mediaUrl: string | undefined;

      if (message.attachments && message.attachments.length > 0) {
        const attachment = message.attachments[0];
        messageType = attachment.type;
        mediaUrl = attachment.payload.url;
      }

      // Salvar mensagem
      const userMessageId = await this.saveMessage({
        conversationId: conversation.id,
        from: senderId,
        to: 'bot',
        type: messageType,
        content,
        mediaUrl,
        timestamp: new Date(message.timestamp),
        channel: 'instagram',
      });
      logger.info('✅ Mensagem do usuário salva com ID:', userMessageId);

      // Emitir evento WebSocket
      io.emit('message:new', {
        conversationId: conversation.id,
        message: {
          id: userMessageId,
          conversationId: conversation.id,
          senderId,
          content,
          type: messageType,
          mediaUrl,
          timestamp: new Date(),
          isFromBot: false,
          isRead: false,
          status: 'sent',
          channel: 'instagram',
        },
      });
      logger.info('📡 Evento message:new emitido (mensagem do usuário Instagram)');

      // Processar mensagem baseado no status da conversa
      const conv = conversation as any;
      logger.info(`🔍 Status da conversa: ${conv.status}`);

      if (conv.status === 'bot') {
        logger.info('🤖 Processando mensagem pelo bot...');
        await this.processBotMessage(conversation, content, senderId);
        logger.info('✅ Mensagem processada pelo bot!');
      } else if (conv.status === 'waiting') {
        logger.info(`⏳ Conversa ${conversation.id} aguardando atendente`);
      } else if (conv.status === 'human') {
        logger.info(`👤 Conversa ${conversation.id} em atendimento humano`);
      }

      // Emitir evento de atualização da conversa
      io.emit('conversation:updated', {
        conversationId: conversation.id,
        lastActivity: new Date(),
        channel: 'instagram',
      });
    } catch (error) {
      logger.error('❌ ERRO CRÍTICO ao processar mensagem Instagram:', error);
    }
  }

  /**
   * Busca ou cria uma conversa para o usuário do Instagram
   */
  private async getOrCreateConversation(
    senderId: string,
    contactName: string,
    contactAvatar?: string
  ) {
    // Buscar conversa existente pelo contactId (IGSID)
    const snapshot = await db
      .collection(collections.conversations)
      .where('contactId', '==', senderId)
      .where('channel', '==', 'instagram')
      .where('status', 'in', ['bot', 'human', 'waiting', 'closed'])
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();

      // Se conversa estava fechada, reabrir
      if (data.status === 'closed') {
        logger.info(`🔄 Reabrindo conversa Instagram fechada: ${doc.id}`);
        await db.collection(collections.conversations).doc(doc.id).update({
          status: 'bot',
          contactName,
          contactAvatar,
          context: {
            stage: 'initial',
            userData: {},
            lastIntent: '',
          },
          updatedAt: new Date(),
          lastActivity: new Date(),
        });

        return {
          id: doc.id,
          ...data,
          status: 'bot',
          contactName,
          contactAvatar,
          context: {
            stage: 'initial',
            userData: {},
            lastIntent: '',
          },
        };
      }

      // Atualizar nome/avatar se mudou
      if (data.contactName !== contactName || data.contactAvatar !== contactAvatar) {
        await db.collection(collections.conversations).doc(doc.id).update({
          contactName,
          contactAvatar,
          updatedAt: new Date(),
        });
      }

      return { id: doc.id, ...doc.data(), contactName, contactAvatar };
    }

    // Criar nova conversa
    const conversationId = generateId();
    const conversation = {
      phoneNumber: '', // Vazio para Instagram
      contactId: senderId, // IGSID
      contactName,
      contactAvatar,
      status: 'bot',
      channel: 'instagram' as ChannelType,
      context: {
        stage: 'initial',
        userData: {},
        lastIntent: '',
      },
      tags: [],
      priority: 'medium',
      source: 'official', // Instagram usa API oficial
      lastActivity: new Date(),
      unreadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection(collections.conversations).doc(conversationId).set(conversation);

    logger.info(`✅ Nova conversa Instagram criada: ${conversationId} para ${contactName}`);

    return { id: conversationId, ...conversation };
  }

  /**
   * Salva uma mensagem no Firestore
   */
  private async saveMessage(data: any): Promise<string> {
    const messageId = generateId();
    const isFromBot = data.from === 'bot';

    const message = {
      conversationId: data.conversationId,
      senderId: data.from,
      content: data.content,
      type: data.type || 'text',
      mediaUrl: data.mediaUrl,
      timestamp: data.timestamp || new Date(),
      isFromBot,
      isRead: false,
      id: messageId,
      status: 'sent',
      channel: data.channel || 'instagram',
    };

    await db.collection(collections.messages).doc(messageId).set(message);

    // Atualizar última mensagem da conversa
    await db.collection(collections.conversations).doc(data.conversationId).update({
      lastMessage: {
        id: messageId,
        content: data.content,
        timestamp: new Date(),
        isFromBot,
      },
      lastActivity: new Date(),
      updatedAt: new Date(),
    });

    return messageId;
  }

  /**
   * Processa mensagem pelo bot e envia resposta
   */
  private async processBotMessage(
    conversation: any,
    content: string,
    senderId: string
  ): Promise<void> {
    try {
      logger.info('🔄 Iniciando processBotMessage Instagram...');

      // Mostrar indicador de digitação
      await instagramClient.sendTypingOn(senderId);

      // Buscar contexto
      let context = await this.contextManager.getContext(conversation.id);
      if (!context || !context.stage) {
        context = conversation.context || {
          stage: 'initial',
          userData: {},
          lastIntent: '',
        };
      }

      // Processar pelo Flow Engine
      const response = await this.flowEngine.processMessage(content, context);
      logger.info('✅ Resposta do Flow Engine:', {
        hasMessage: !!response.message,
        transferToHuman: response.transferToHuman,
        endConversation: response.endConversation,
      });

      // Atualizar contexto
      await this.contextManager.updateContext(conversation.id, response.context);

      // Enviar resposta
      if (response.message) {
        const sent = await instagramClient.sendTextMessage(senderId, response.message);
        
        if (sent) {
          logger.info('✅ Mensagem enviada com sucesso via Instagram!');

          // Salvar resposta do bot
          const botMessageId = await this.saveMessage({
            conversationId: conversation.id,
            from: 'bot',
            to: senderId,
            type: 'text',
            content: response.message,
            timestamp: new Date(),
            channel: 'instagram',
          });

          // Emitir evento WebSocket
          io.emit('message:new', {
            conversationId: conversation.id,
            message: {
              id: botMessageId,
              conversationId: conversation.id,
              senderId: 'bot',
              content: response.message,
              type: 'text',
              timestamp: new Date(),
              isFromBot: true,
              isRead: false,
              status: 'sent',
              channel: 'instagram',
            },
          });
        } else {
          logger.error('❌ Falha ao enviar mensagem via Instagram');
        }
      } else {
        // Fallback
        const fallbackMessage = 'Olá! Como posso ajudar você hoje?';
        await instagramClient.sendTextMessage(senderId, fallbackMessage);
      }

      // Transferir para humano se necessário
      if (response.transferToHuman) {
        await this.transferToHuman(conversation.id, response.department);
      }

      // Encerrar conversa se necessário
      if (response.endConversation) {
        await this.endConversation(conversation.id);
      }
    } catch (error) {
      logger.error('❌ ERRO em processBotMessage Instagram:', error);

      // Enviar mensagem de erro
      await instagramClient.sendTextMessage(
        senderId,
        'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
      );
    }
  }

  /**
   * Transfere conversa para atendimento humano
   */
  private async transferToHuman(conversationId: string, departmentName?: string): Promise<void> {
    try {
      logger.info(`🔄 Transferindo conversa Instagram ${conversationId} para departamento: ${departmentName || 'Geral'}`);

      // Buscar departamento
      let departmentId: string | null = null;
      if (departmentName && departmentName !== 'Geral') {
        const deptSnapshot = await db
          .collection(collections.departments)
          .where('name', '==', departmentName)
          .limit(1)
          .get();

        if (!deptSnapshot.empty) {
          departmentId = deptSnapshot.docs[0].id;
        }
      }

      // Buscar operadores online
      const usersSnapshot = await db
        .collection(collections.users)
        .where('status', '==', 'online')
        .where('role', 'in', ['operator', 'supervisor'])
        .get();

      let availableOperators = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Filtrar por departamento
      if (departmentId) {
        availableOperators = availableOperators.filter(
          (op: any) => op.departmentId === departmentId
        );
      }

      if (availableOperators.length > 0) {
        const assignedOperator = availableOperators[0];

        await db.collection(collections.conversations).doc(conversationId).update({
          status: 'human',
          assignedTo: assignedOperator.id,
          department: departmentName || 'Geral',
          departmentId: departmentId || null,
          updatedAt: new Date(),
        });

        io.emit('conversation:assigned', {
          conversationId,
          operatorId: assignedOperator.id,
          department: departmentName || 'Geral',
          channel: 'instagram',
        });
      } else {
        await db.collection(collections.conversations).doc(conversationId).update({
          status: 'waiting',
          department: departmentName || 'Geral',
          departmentId: departmentId || null,
          updatedAt: new Date(),
        });

        io.emit('conversation:waiting', {
          conversationId,
          department: departmentName || 'Geral',
          channel: 'instagram',
        });
      }
    } catch (error) {
      logger.error('❌ Erro ao transferir para humano (Instagram):', error);
    }
  }

  /**
   * Encerra uma conversa
   */
  private async endConversation(conversationId: string): Promise<void> {
    try {
      await db.collection(collections.conversations).doc(conversationId).update({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
        context: {
          stage: 'initial',
          userData: {},
          lastIntent: 'ended',
        },
      });

      io.emit('conversation:closed', { conversationId, channel: 'instagram' });
      logger.info(`✅ Conversa Instagram ${conversationId} encerrada`);
    } catch (error) {
      logger.error('❌ Erro ao encerrar conversa Instagram:', error);
    }
  }

  /**
   * Envia mensagem manual do operador para o Instagram
   */
  async sendOperatorMessage(conversationId: string, content: string, operatorId: string): Promise<boolean> {
    try {
      // Buscar conversa
      const convDoc = await db.collection(collections.conversations).doc(conversationId).get();
      if (!convDoc.exists) {
        logger.error('❌ Conversa não encontrada:', conversationId);
        return false;
      }

      const conversation = convDoc.data();
      if (conversation?.channel !== 'instagram') {
        logger.error('❌ Conversa não é do Instagram');
        return false;
      }

      const senderId = conversation.contactId;
      if (!senderId) {
        logger.error('❌ ContactId não encontrado na conversa');
        return false;
      }

      // Enviar mensagem
      const sent = await instagramClient.sendTextMessage(senderId, content);
      if (!sent) {
        return false;
      }

      // Salvar mensagem
      const messageId = await this.saveMessage({
        conversationId,
        from: operatorId,
        to: senderId,
        type: 'text',
        content,
        timestamp: new Date(),
        channel: 'instagram',
      });

      // Emitir evento
      io.emit('message:new', {
        conversationId,
        message: {
          id: messageId,
          conversationId,
          senderId: operatorId,
          content,
          type: 'text',
          timestamp: new Date(),
          isFromBot: false,
          isFromOperator: true,
          isRead: false,
          status: 'sent',
          channel: 'instagram',
        },
      });

      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar mensagem do operador (Instagram):', error);
      return false;
    }
  }
}

export default new InstagramMessageHandler();
