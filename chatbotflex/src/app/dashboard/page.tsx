'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';
import { 
  MessageCircle, 
  Users, 
  Clock, 
  CheckCircle, 
  TrendingUp,
  Activity,
  Bot,
  AlertCircle
} from 'lucide-react';
import { DashboardStats, Conversation } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { conversations } = useChatStore();
  const socket = useSocket();
  
  const [stats, setStats] = useState<DashboardStats>({
    activeChats: 0,
    waitingChats: 0,
    closedToday: 0,
    averageResponseTime: 0,
    operatorsOnline: 0,
    botAccuracy: 0,
  });
  
  const [recentActivity, setRecentActivity] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscar estatísticas
  useEffect(() => {
    fetchDashboardData();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchDashboardData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Atualizar em tempo real via Socket
  useEffect(() => {
    if (!socket) return;

    socket.on('stats:update', (newStats: DashboardStats) => {
      setStats(newStats);
    });

    socket.on('conversation:new', () => {
      fetchDashboardData();
    });

    socket.on('conversation:closed', () => {
      fetchDashboardData();
    });

    return () => {
      socket.off('stats:update');
      socket.off('conversation:new');
      socket.off('conversation:closed');
    };
  }, [socket]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Buscar estatísticas
      const statsResponse = await api.get('/dashboard/stats');
      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }

      // Buscar atividades recentes
      const activityResponse = await api.get('/dashboard/recent-activity', {
        params: { limit: 10 }
      });
      if (activityResponse.data.success) {
        setRecentActivity(activityResponse.data.data);
      }
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bot': return 'bg-blue-100 text-blue-800';
      case 'human': return 'bg-green-100 text-green-800';
      case 'waiting': return 'bg-yellow-100 text-yellow-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'bot': return 'Bot';
      case 'human': return 'Atendimento Humano';
      case 'waiting': return 'Aguardando';
      case 'closed': return 'Encerrado';
      default: return status;
    }
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}min`;
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <DashboardSkeleton />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Bem-vindo, {user?.displayName || user?.email || 'Operador'}! 👋
        </h1>
        <p className="text-gray-600">
          Aqui está um resumo do seu sistema de atendimento
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Chats Ativos */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Chats Ativos</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent mt-2">
                {stats.activeChats}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
              <MessageCircle className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <Activity className="h-4 w-4 text-blue-600 mr-1" />
            <span className="text-gray-600">Em atendimento agora</span>
          </div>
        </div>

        {/* Aguardando Atendimento */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Aguardando</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-yellow-400 bg-clip-text text-transparent mt-2">
                {stats.waitingChats}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg">
              <Clock className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600 mr-1" />
            <span className="text-gray-600">Necessitam atenção</span>
          </div>
        </div>

        {/* Atendidos Hoje */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Atendidos Hoje</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-400 bg-clip-text text-transparent mt-2">
                {stats.closedToday}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-gray-600">Conversas finalizadas</span>
          </div>
        </div>

        {/* Operadores Online */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Operadores Online</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent mt-2">
                {stats.operatorsOnline}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
              <Users className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <div className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-gray-600">Disponíveis agora</span>
          </div>
        </div>

        {/* Tempo Médio de Resposta */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tempo Médio</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-400 bg-clip-text text-transparent mt-2">
                {formatResponseTime(stats.averageResponseTime)}
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
              <Clock className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-600">Resposta aos clientes</span>
          </div>
        </div>

        {/* Acurácia do Bot */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-xl hover:scale-105 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Acurácia do Bot</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-400 bg-clip-text text-transparent mt-2">
                {stats.botAccuracy}%
              </p>
            </div>
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg">
              <Bot className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-600">Resoluções automáticas</span>
          </div>
        </div>
      </div>

      {/* Atividade Recente */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Activity className="h-5 w-5 mr-2 text-indigo-600" />
            Atividade Recente
          </h2>
        </div>
        
        <div className="divide-y divide-gray-200">
          {recentActivity.length > 0 ? (
            recentActivity.map((conversation) => (
              <div 
                key={conversation.id} 
                className="px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-gray-600" />
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conversation.contactName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {conversation.phoneNumber}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(conversation.status)}`}>
                      {getStatusText(conversation.status)}
                    </span>
                    
                    <span className="text-sm text-gray-500">
                      {new Date(conversation.updatedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
                
                {conversation.lastMessage && (
                  <div className="mt-2 ml-14">
                    <p className="text-sm text-gray-600 truncate">
                      {conversation.lastMessage.content}
                    </p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-6 py-12 text-center">
              <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma atividade recente</p>
            </div>
          )}
        </div>
      </div>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}