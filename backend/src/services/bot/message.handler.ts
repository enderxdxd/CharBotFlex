import { db, collections } from '../../config/firebase.js';
import { FlowEngine } from './flow.engine.js';
import { ContextManager } from './context.manager.js';
import { generateId } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';
import { io } from '../../server.js';

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
      const userMessageId = await this.saveMessage({
        conversationId: conversation.id,
        from: phoneNumber,
        to: 'bot',
        type: message.type || 'text',
        content,
        timestamp: message.timestamp || new Date(),
      });
      logger.info('✅ Mensagem do usuário salva com ID:', userMessageId);

      // ✅ CORREÇÃO 1: Emitir evento WebSocket com estrutura completa
      io.emit('message:new', {
        conversationId: conversation.id,
        message: {
          id: userMessageId,
          conversationId: conversation.id,
          senderId: phoneNumber,
          content,
          type: message.type || 'text',
          timestamp: new Date(),
          isFromBot: false, // ✅ Mensagem do USUÁRIO
          isRead: false,
          status: 'sent',
        }
      });
      logger.info('📡 Evento message:new emitido (mensagem do usuário)');

      // Processar mensagem baseado no status da conversa
      const conv = conversation as any; // Casting para resolver tipos
      logger.info(`🔍 Status da conversa: ${conv.status}`);
      
      if (conv.status === 'bot') {
        logger.info('🤖 Processando mensagem pelo bot...');
        await this.processBotMessage(conversation, content, phoneNumber);
        logger.info('✅ Mensagem processada pelo bot!');
      } else if (conv.status === 'waiting') {
        // Conversa aguardando atendimento humano
        logger.info(`⏳ Conversa ${conversation.id} aguardando atendente`);
      } else if (conv.status === 'human') {
        // Conversa em atendimento humano - não processar pelo bot
        logger.info(`👤 Conversa ${conversation.id} em atendimento humano`);
      }
      
      // ✅ CORREÇÃO 2: Emitir evento de atualização da conversa
      io.emit('conversation:updated', {
        conversationId: conversation.id,
        lastActivity: new Date(),
      });
      logger.info('📡 Evento conversation:updated emitido');
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
    const isFromBot = data.from === 'bot';
    
    // ✅ CORREÇÃO 3: Logs detalhados para debug
    logger.info('💾 Salvando mensagem:', {
      from: data.from,
      isFromBot,
      content: data.content.substring(0, 50),
      conversationId: data.conversationId,
    });
    
    const message = {
      conversationId: data.conversationId,
      senderId: data.from,
      content: data.content,
      type: data.type || 'text',
      timestamp: data.timestamp || new Date(),
      isFromBot, // ✅ Campo crítico para layout
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
        isFromBot,
      },
      lastActivity: new Date(),
      updatedAt: new Date(),
    });
    
    return messageId; // ✅ Retornar ID para usar no evento WebSocket
  }

  private async processBotMessage(conversation: any, content: string, phoneNumber: string) {
    try {
      logger.info('🔄 Iniciando processBotMessage...');
      
      // Buscar contexto da conversa
      logger.info('📋 Buscando contexto da conversa...');
      const context = await this.contextManager.getContext(conversation.id);
      logger.info('✅ Contexto obtido:', context);

      // Processar mensagem pelo Flow Engine
      logger.info('⚙️ Processando mensagem pelo Flow Engine...');
      const response = await this.flowEngine.processMessage(content, context);
      logger.info('✅ Resposta do Flow Engine:', { 
        hasMessage: !!response.message, 
        messagePreview: response.message?.substring(0, 50),
        transferToHuman: response.transferToHuman 
      });

      // Atualizar contexto
      logger.info('💾 Atualizando contexto...');
      await this.contextManager.updateContext(conversation.id, response.context);
      logger.info('✅ Contexto atualizado');

      // Enviar resposta
      if (response.message) {
        logger.info('📤 Enviando resposta do bot para:', phoneNumber);
        logger.info('📝 Mensagem:', response.message.substring(0, 100));
        
        try {
          await this.whatsappManager.sendMessage(phoneNumber, response.message);
          logger.info('✅ Mensagem enviada com sucesso via WhatsApp!');
        } catch (sendError) {
          logger.error('❌ ERRO ao enviar mensagem via WhatsApp:', sendError);
          throw sendError;
        }
      } else {
        // ⚠️ Flow não retornou mensagem - enviar fallback
        logger.warn('⚠️ Flow não retornou mensagem - enviando fallback');
        const fallbackMessage = 'Olá! Como posso ajudar você hoje?';
        await this.whatsappManager.sendMessage(phoneNumber, fallbackMessage);
        response.message = fallbackMessage; // Atualizar response para salvar
      }
      
      // Salvar mensagem (seja do flow ou fallback)
      if (response.message) {

        // Salvar resposta do bot
        const botMessageId = await this.saveMessage({
          conversationId: conversation.id,
          from: 'bot',
          to: phoneNumber,
          type: 'text',
          content: response.message,
          timestamp: new Date(),
        });
        logger.info('✅ Resposta do bot salva com ID:', botMessageId);
        
        // ✅ CORREÇÃO 4: Emitir evento WebSocket da resposta do bot
        io.emit('message:new', {
          conversationId: conversation.id,
          message: {
            id: botMessageId,
            conversationId: conversation.id,
            senderId: 'bot',
            content: response.message,
            type: 'text',
            timestamp: new Date(),
            isFromBot: true, // ✅ Mensagem do BOT
            isRead: false,
            status: 'sent',
          }
        });
        logger.info('📡 Evento message:new emitido (resposta do bot)');
      }

      // Verificar se deve transferir para humano
      if (response.transferToHuman) {
        logger.info('🔄 Transferindo para humano...');
        await this.transferToHuman(conversation.id, response.department);
      }
      
      logger.info('✅ processBotMessage concluído com sucesso!');
    } catch (error) {
      logger.error('❌ ERRO em processBotMessage:', error);
      logger.error('Stack trace:', (error as Error).stack);
      
      // Tentar enviar mensagem de erro ao usuário
      try {
        await this.whatsappManager.sendMessage(
          phoneNumber, 
          'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
        );
      } catch (sendError) {
        logger.error('Erro ao enviar mensagem de erro:', sendError);
      }
    }
  }

  private async transferToHuman(conversationId: string, departmentName?: string) {
    try {
      logger.info(`🔄 Transferindo conversa ${conversationId} para departamento: ${departmentName || 'Geral'}`);
      
      // ✅ Buscar departamento pelo nome para pegar o ID
      let departmentId: string | null = null;
      if (departmentName && departmentName !== 'Geral') {
        logger.info(`🔍 Buscando departamento por nome: ${departmentName}`);
        const deptSnapshot = await db.collection(collections.departments)
          .where('name', '==', departmentName)
          .limit(1)
          .get();
        
        if (!deptSnapshot.empty) {
          departmentId = deptSnapshot.docs[0].id;
          logger.info(`✅ Departamento encontrado: ${departmentId}`);
        } else {
          logger.warn(`⚠️ Departamento "${departmentName}" não encontrado no banco`);
        }
      }
      
      // ✅ Buscar operadores online
      logger.info(`🔍 Buscando operadores online...`);
      const usersSnapshot = await db.collection(collections.users)
        .where('status', '==', 'online')
        .where('role', 'in', ['operator', 'supervisor'])
        .get();
      
      logger.info(`📊 Total de usuários online encontrados: ${usersSnapshot.docs.length}`);
      
      let availableOperators = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      logger.info(`👥 Todos os operadores online:`, availableOperators.map((op: any) => ({
        id: op.id,
        name: (op as any).name || 'N/A',
        departmentId: op.departmentId,
        role: op.role,
        status: op.status
      })));
      
      // Filtrar por departamento se especificado
      if (departmentId) {
        logger.info(`🔍 Filtrando operadores por departmentId: ${departmentId}`);
        
        // ✅ FILTRAR APENAS operadores do departamento específico
        availableOperators = availableOperators.filter((op: any) => {
          const match = op.departmentId === departmentId;
          logger.info(`🔍 Operador ${op.id} (${(op as any).name}): departmentId="${op.departmentId}" === "${departmentId}" ? ${match}`);
          return match;
        });
        
        logger.info(`✅ Encontrados ${availableOperators.length} operadores do departamento ${departmentName}`);
      }
      
      logger.info(`👥 Operadores disponíveis: ${availableOperators.length}`);
      
      if (availableOperators.length > 0) {
        // ✅ Atribuir ao primeiro operador disponível
        const assignedOperator = availableOperators[0];
        
        logger.info(`✅ Atribuindo conversa ${conversationId} ao operador:`, {
          operatorId: assignedOperator.id,
          operatorName: (assignedOperator as any).name || 'N/A',
          department: departmentName || 'Geral',
          status: 'human'
        });
        
        await db.collection(collections.conversations).doc(conversationId).update({
          status: 'human',
          assignedTo: assignedOperator.id,
          department: departmentName || 'Geral',
          departmentId: departmentId || null,
          updatedAt: new Date(),
        });
        
        logger.info(`✅ Conversa atribuída com sucesso! Dados salvos no Firestore.`);
        
        // Emitir evento para o operador específico
        io.emit('conversation:assigned', { 
          conversationId, 
          operatorId: assignedOperator.id,
          department: departmentName || 'Geral'
        });
        
        logger.info(`📡 Evento 'conversation:assigned' emitido para operador ${assignedOperator.id}`);
      } else {
        // Nenhum operador disponível, deixar em waiting
        await db.collection(collections.conversations).doc(conversationId).update({
          status: 'waiting',
          department: departmentName || 'Geral',
          departmentId: departmentId || null,
          updatedAt: new Date(),
        });
        
        logger.warn(`⚠️ Nenhum operador disponível no departamento ${departmentName || 'Geral'}`);
        
        // Emitir evento
        io.emit('conversation:waiting', { conversationId, department: departmentName || 'Geral' });
      }
    } catch (error) {
      logger.error('Erro ao transferir para humano:', error);
    }
  }
}