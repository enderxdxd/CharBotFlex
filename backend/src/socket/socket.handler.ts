import { Server, Socket } from 'socket.io';
import { UserService } from '../services/user.service.js';
import { TransferService } from '../services/transfer.service.js';
import logger from '../utils/logger.js';

const userService = new UserService();
const transferService = new TransferService();

export const initSocketHandlers = (io: Server) => {
  // 🔧 Log de configurações do servidor Socket.IO
  logger.info('🔧 Configurações Socket.IO:', {
    pingTimeout: (io.engine as any).opts.pingTimeout,
    pingInterval: (io.engine as any).opts.pingInterval,
    transports: (io.engine as any).opts.transports,
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.handshake.auth.userId;

    if (!userId) {
      logger.warn('Conexão Socket sem userId');
      socket.disconnect();
      return;
    }

    logger.info(`✅ Socket conectado: ${userId} | Transport: ${socket.conn.transport.name}`);

    // Atualizar status do usuário para online
    try {
      await userService.updateUserStatus(userId, 'online');
      
      // Notificar outros usuários
      io.emit('user:status', { userId, status: 'online' });
    } catch (error) {
      logger.error('Erro ao atualizar status:', error);
    }

    // Entrar na sala do usuário
    socket.join(`user:${userId}`);

    // Event: Enviar mensagem
    socket.on('message:send', async (data: { conversationId: string; content: string }) => {
      try {
        logger.info(`Mensagem recebida de ${userId}:`, data);

        // TODO: Processar e salvar mensagem
        // TODO: Enviar via WhatsApp
        
        // Emitir para todos na conversa
        io.to(`conversation:${data.conversationId}`).emit('message:new', {
          conversationId: data.conversationId,
          from: userId,
          content: data.content,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
        socket.emit('error', { message: 'Erro ao enviar mensagem' });
      }
    });

    // Event: Usuário digitando
    socket.on('conversation:typing', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('conversation:typing', {
        conversationId,
        userId,
      });
    });

    // Event: Aceitar transferência
    socket.on('transfer:accept', async (transferId: string) => {
      try {
        const transfer = await transferService.acceptTransfer(transferId);
        
        // Notificar usuário que solicitou a transferência
        io.to(`user:${transfer.fromUser}`).emit('transfer:accepted', transfer);
        
        // Notificar usuário que aceitou
        socket.emit('transfer:accepted', transfer);
      } catch (error) {
        logger.error('Erro ao aceitar transferência:', error);
        socket.emit('error', { message: 'Erro ao aceitar transferência' });
      }
    });

    // Event: Rejeitar transferência
    socket.on('transfer:reject', async (transferId: string) => {
      try {
        const transfer = await transferService.rejectTransfer(transferId);
        
        // Notificar usuário que solicitou a transferência
        io.to(`user:${transfer.fromUser}`).emit('transfer:rejected', transfer);
        
        socket.emit('transfer:rejected', transfer);
      } catch (error) {
        logger.error('Erro ao rejeitar transferência:', error);
        socket.emit('error', { message: 'Erro ao rejeitar transferência' });
      }
    });

    // Event: Atualizar status do usuário
    socket.on('user:status', async (status: 'online' | 'offline' | 'busy') => {
      try {
        await userService.updateUserStatus(userId, status);
        
        // Notificar todos os usuários
        io.emit('user:status', { userId, status });
      } catch (error) {
        logger.error('Erro ao atualizar status:', error);
      }
    });

    // Event: Entrar em uma conversa
    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      logger.info(`Usuário ${userId} entrou na conversa ${conversationId}`);
    });

    // Event: Sair de uma conversa
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      logger.info(`Usuário ${userId} saiu da conversa ${conversationId}`);
    });

    // Event: Desconexão
    socket.on('disconnect', async () => {
      logger.info(`❌ Socket desconectado: ${userId}`);

      try {
        // Atualizar status do usuário para offline
        await userService.updateUserStatus(userId, 'offline');
        
        // Notificar outros usuários
        io.emit('user:status', { userId, status: 'offline' });
      } catch (error) {
        logger.error('Erro ao atualizar status na desconexão:', error);
      }
    });
  });
};