import { Request, Response } from 'express';
import { db } from '../config/firebase';
import logger from '../utils/logger';

/**
 * Criar conversa de teste
 */
export const createTestConversation = async (req: Request, res: Response) => {
  try {
    const testConversation = {
      phoneNumber: '+5511999887766',
      contactName: 'João Silva (Teste)',
      status: 'waiting',
      lastMessage: {
        id: 'msg1',
        content: 'Olá, preciso de ajuda!',
        timestamp: new Date(),
        isFromBot: false,
      },
      lastActivity: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      priority: 'medium',
      unreadCount: 1,
    };

    const docRef = await db.collection('conversations').add(testConversation);
    
    // Criar algumas mensagens de teste
    const messages = [
      {
        conversationId: docRef.id,
        senderId: 'customer',
        content: 'Olá, preciso de ajuda!',
        type: 'text',
        timestamp: new Date(Date.now() - 60000),
        isFromBot: false,
        isRead: true,
      },
      {
        conversationId: docRef.id,
        senderId: 'bot',
        content: 'Olá! Como posso ajudar você hoje?',
        type: 'text',
        timestamp: new Date(Date.now() - 30000),
        isFromBot: true,
        isRead: true,
      },
      {
        conversationId: docRef.id,
        senderId: 'customer',
        content: 'Gostaria de saber sobre meus pedidos',
        type: 'text',
        timestamp: new Date(),
        isFromBot: false,
        isRead: false,
      },
    ];

    for (const msg of messages) {
      await db.collection('messages').add(msg);
    }

    logger.info(`✅ Conversa de teste criada: ${docRef.id}`);

    res.json({
      success: true,
      message: 'Conversa de teste criada com sucesso!',
      data: {
        id: docRef.id,
        ...testConversation,
      },
    });
  } catch (error: any) {
    logger.error('Erro ao criar conversa de teste:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar conversa de teste',
    });
  }
};

/**
 * Criar múltiplas conversas de teste
 */
export const createMultipleTestConversations = async (req: Request, res: Response) => {
  try {
    const conversations = [
      {
        phoneNumber: '+5511999887766',
        contactName: 'João Silva',
        status: 'waiting',
        content: 'Olá, preciso de ajuda com meu pedido',
      },
      {
        phoneNumber: '+5511988776655',
        contactName: 'Maria Santos',
        status: 'human',
        assignedTo: 'operator1',
        assignedToName: 'Carlos Operador',
        content: 'Obrigado pelo atendimento!',
      },
      {
        phoneNumber: '+5511977665544',
        contactName: 'Pedro Costa',
        status: 'bot',
        content: 'Qual é o horário de funcionamento?',
      },
      {
        phoneNumber: '+5511966554433',
        contactName: 'Ana Paula',
        status: 'human',
        assignedTo: 'operator2',
        assignedToName: 'Julia Atendente',
        content: 'Vou verificar isso para você',
      },
    ];

    const created = [];

    for (const conv of conversations) {
      const { content, ...convData } = conv;
      
      const conversation = {
        ...convData,
        lastMessage: {
          id: `msg_${Date.now()}`,
          content,
          timestamp: new Date(),
          isFromBot: false,
        },
        lastActivity: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
        priority: 'medium' as const,
        unreadCount: 1,
      };

      const docRef = await db.collection('conversations').add(conversation);
      
      // Criar mensagem
      await db.collection('messages').add({
        conversationId: docRef.id,
        senderId: 'customer',
        content,
        type: 'text',
        timestamp: new Date(),
        isFromBot: false,
        isRead: false,
      });

      created.push({ id: docRef.id, ...conversation });
    }

    logger.info(`✅ ${created.length} conversas de teste criadas`);

    res.json({
      success: true,
      message: `${created.length} conversas de teste criadas com sucesso!`,
      data: created,
    });
  } catch (error: any) {
    logger.error('Erro ao criar conversas de teste:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar conversas de teste',
    });
  }
};

/**
 * Limpar todas as conversas de teste
 */
export const clearTestConversations = async (req: Request, res: Response) => {
  try {
    const conversationsSnapshot = await db.collection('conversations').get();
    const messagesSnapshot = await db.collection('messages').get();

    const batch = db.batch();

    conversationsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    messagesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info('✅ Todas as conversas e mensagens foram removidas');

    res.json({
      success: true,
      message: 'Todas as conversas foram removidas',
      deleted: {
        conversations: conversationsSnapshot.size,
        messages: messagesSnapshot.size,
      },
    });
  } catch (error: any) {
    logger.error('Erro ao limpar conversas:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao limpar conversas',
    });
  }
};
