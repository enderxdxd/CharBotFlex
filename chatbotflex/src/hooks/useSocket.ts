import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

let socket: Socket | null = null;

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    // Criar conexão apenas se não existir
    if (!socket) {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
      
      socket = io(wsUrl, {
        auth: {
          userId: user.uid,
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        console.log('✅ Socket conectado');
        setIsConnected(true);
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket desconectado');
        setIsConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.error('Erro de conexão Socket:', error);
        setIsConnected(false);
      });

      socket.on('reconnect', (attemptNumber) => {
        console.log(`🔄 Socket reconectado após ${attemptNumber} tentativas`);
        setIsConnected(true);
      });
    }

    return () => {
      // Não desconectar no cleanup, manter a conexão ativa
    };
  }, [user]);

  return socket;
};

// Hook auxiliar para verificar status da conexão
export const useSocketStatus = () => {
  const [isConnected, setIsConnected] = useState(false);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Verificar status inicial
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  return { isConnected, socket };
};