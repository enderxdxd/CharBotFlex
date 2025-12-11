'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/hooks/useSocket';
import { MessageCircle, Search, Filter, Clock, User, Send, Paperclip, Smile, ArrowLeft, X, CheckCircle, Plus, UserPlus, Instagram } from 'lucide-react';
import { Conversation, Message } from '@/types';
import { ConversationSkeleton, MessageSkeleton } from '@/components/ui/Skeleton';
import { TransferModal } from '@/components/chat/TransferModal';
import { toast } from 'sonner';
import api from '@/lib/api';

// ✅ Função helper para formatar timestamp
const formatMessageTime = (timestamp: any): string => {
  try {
    let date: Date;
    
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (timestamp?._seconds) {
      // Firestore Timestamp serializado
      date = new Date(timestamp._seconds * 1000);
    } else if (timestamp?.toDate) {
      // Firestore Timestamp nativo
      date = timestamp.toDate();
    } else {
      // Fallback
      date = new Date(timestamp);
    }
    
    // Validar se é data válida
    if (isNaN(date.getTime())) {
      return '--:--';
    }
    
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (error) {
    console.error('Erro ao formatar timestamp:', error, timestamp);
    return '--:--';
  }
};

export default function ChatsPage() {
  const { conversations, messages, selectedConversation, fetchConversations, fetchMessages, sendMessage, setSelectedConversation, closeConversation } = useChatStore();
  const socket = useSocket();
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all'); // 'all' | 'whatsapp' | 'instagram'
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadConversations = async () => {
      setLoadingConversations(true);
      await fetchConversations();
      setLoadingConversations(false);
    };
    loadConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (data: any) => {
      console.log('📨 EVENTO message:new recebido:', data);
      console.log('📊 Dados da mensagem:', {
        isFromBot: data.message?.isFromBot,
        senderId: data.message?.senderId,
        content: data.message?.content?.substring(0, 50),
      });
      
      if (selectedConversation && data.conversationId === selectedConversation.id) {
        fetchMessages(selectedConversation.id);
      }
      fetchConversations();
    });

    // ✅ Escutar evento de atualização de conversa (reordena lista)
    socket.on('conversation:updated', (data: any) => {
      console.log('🔄 EVENTO conversation:updated recebido:', data);
      fetchConversations(); // Recarregar lista para reordenar
    });

    return () => {
      socket.off('message:new');
      socket.off('conversation:updated');
    };
  }, [socket, selectedConversation, fetchConversations, fetchMessages]);

  const handleSelectConversation = async (conversation: Conversation) => {
    console.log('📱 Conversa selecionada:', conversation);
    setSelectedConversation(conversation);
    setLoadingMessages(true);
    await fetchMessages(conversation.id);
    setLoadingMessages(false);
    console.log('💬 Mensagens no store:', messages[conversation.id]);
    setShowMobileChat(true); // Mostrar chat em mobile
    
    if (socket) {
      socket.emit('conversation:join', conversation.id);
    }
  };

  // Scroll automático para última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (selectedConversation && messages[selectedConversation.id]) {
      scrollToBottom();
    }
  }, [messages, selectedConversation]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    try {
      await sendMessage(selectedConversation.id, messageInput);
      setMessageInput('');
      setTimeout(scrollToBottom, 100); // Scroll após enviar
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleAcceptConversation = async () => {
    if (!selectedConversation) return;

    try {
      toast.info('Assumindo controle da conversa...');
      
      // Atribuir conversa ao atendente atual
      const response = await api.post(`/conversations/${selectedConversation.id}/assign`, {
        status: 'human'
      });

      if (response.data.success) {
        toast.success('Você assumiu o controle da conversa!');
        // Atualizar conversa local
        await fetchConversations();
        if (selectedConversation) {
          await fetchMessages(selectedConversation.id);
        }
      }
    } catch (error: any) {
      console.error('Erro ao aceitar conversa:', error);
      const errorMessage = error.response?.data?.error || 'Erro ao aceitar conversa';
      toast.error(errorMessage);
    }
  };

  const handleCloseConversation = async () => {
    if (!selectedConversation) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja encerrar a conversa com ${selectedConversation.contactName}?`
    );

    if (!confirmed) return;

    try {
      await closeConversation(selectedConversation.id);
      toast.success('Conversa encerrada com sucesso!');
      setSelectedConversation(null);
      setShowMobileChat(false);
      await fetchConversations(); // Atualizar lista
    } catch (error) {
      console.error('Erro ao fechar conversa:', error);
      toast.error('Erro ao encerrar conversa. Tente novamente.');
    }
  };

  const handleCreateTestConversations = async () => {
    try {
      const response = await api.post('/test/conversations');
      if (response.data.success) {
        toast.success('Conversas de teste criadas!');
        await fetchConversations();
      }
    } catch (error) {
      console.error('Erro ao criar conversas de teste:', error);
      toast.error('Erro ao criar conversas de teste');
    }
  };

  const filteredConversations = conversations
    .filter(conv => {
      const matchesSearch = conv.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           conv.phoneNumber?.includes(searchQuery) ||
                           (conv as any).contactId?.includes(searchQuery);
      
      // ✅ CORREÇÃO: "Todas" mostra apenas conversas ATIVAS (não encerradas)
      let matchesFilter = false;
      if (filterStatus === 'all') {
        matchesFilter = conv.status !== 'closed'; // Excluir encerradas
      } else if (filterStatus === 'closed') {
        matchesFilter = conv.status === 'closed'; // Apenas encerradas
      } else {
        matchesFilter = conv.status === filterStatus;
      }

      // Filtro por canal
      const convChannel = (conv as any).channel || 'whatsapp';
      const matchesChannel = filterChannel === 'all' || convChannel === filterChannel;
      
      return matchesSearch && matchesFilter && matchesChannel;
    })
    .sort((a, b) => {
      // ✅ Ordenar conversas encerradas por closedAt (mais recente primeiro)
      if (filterStatus === 'closed') {
        // Função helper para converter qualquer formato de data
        const getTimestamp = (dateField: any): number => {
          if (!dateField) return 0;
          if (dateField instanceof Date) return dateField.getTime();
          if (typeof dateField === 'string') return new Date(dateField).getTime();
          if (dateField._seconds) return dateField._seconds * 1000;
          if (dateField.toDate) return dateField.toDate().getTime();
          return new Date(dateField).getTime();
        };

        const dateA = getTimestamp(a.closedAt);
        const dateB = getTimestamp(b.closedAt);
        
        // Debug: Log das datas para verificar
        if (dateA && dateB) {
          console.log(`📅 Ordenação: ${a.contactName} (${new Date(dateA).toLocaleString()}) vs ${b.contactName} (${new Date(dateB).toLocaleString()})`);
        }
        
        return dateB - dateA; // Mais recente primeiro
      }
      
      // Para outras conversas, ordenar por updatedAt
      const getTimestamp = (dateField: any): number => {
        if (!dateField) return 0;
        if (dateField instanceof Date) return dateField.getTime();
        if (typeof dateField === 'string') return new Date(dateField).getTime();
        if (dateField._seconds) return dateField._seconds * 1000;
        if (dateField.toDate) return dateField.toDate().getTime();
        return new Date(dateField).getTime();
      };

      const dateA = getTimestamp(a.updatedAt);
      const dateB = getTimestamp(b.updatedAt);
      return dateB - dateA; // Mais recente primeiro
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bot': return 'bg-blue-100 text-blue-700';
      case 'human': return 'bg-green-100 text-green-700';
      case 'waiting': return 'bg-yellow-100 text-yellow-700';
      case 'closed': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'bot': return 'Bot';
      case 'human': return 'Humano';
      case 'waiting': return 'Aguardando';
      case 'closed': return 'Encerrado';
      default: return status;
    }
  };

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="h-[calc(100vh-4rem)] flex bg-gray-50">
          {/* Lista de Conversas */}
          <div className={`w-full md:w-96 bg-white border-r border-gray-200 flex flex-col shadow-sm ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-white">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <MessageCircle className="h-5 w-5 mr-2 text-indigo-600" />
              Conversas
            </h2>
            
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conversas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            {/* Filters - Status */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterStatus === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterStatus('waiting')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterStatus === 'waiting' ? 'bg-yellow-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Aguardando
              </button>
              <button
                onClick={() => setFilterStatus('human')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterStatus === 'human' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Ativas
              </button>
              <button
                onClick={() => setFilterStatus('closed')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterStatus === 'closed' ? 'bg-gray-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Encerradas
              </button>
            </div>

            {/* Filters - Canal */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterChannel('all')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                  filterChannel === 'all' ? 'bg-gray-700 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterChannel('whatsapp')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                  filterChannel === 'whatsapp' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={() => setFilterChannel('instagram')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 ${
                  filterChannel === 'instagram' ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Instagram className="h-3 w-3" />
                Instagram
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <ConversationSkeleton key={i} />
                ))}
              </>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                <MessageCircle className="h-12 w-12 mb-2" />
                <p className="text-sm mb-4">Nenhuma conversa encontrada</p>
                {conversations.length === 0 && (
                  <button
                    onClick={handleCreateTestConversations}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Conversas de Teste
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-all ${
                    selectedConversation?.id === conversation.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:border-l-4 hover:border-l-indigo-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      {/* Avatar com ícone do canal */}
                      <div className="relative mr-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          (conversation as any).channel === 'instagram' 
                            ? 'bg-gradient-to-br from-purple-100 to-pink-100' 
                            : 'bg-green-100'
                        }`}>
                          {(conversation as any).channel === 'instagram' ? (
                            <Instagram className="h-5 w-5 text-purple-600" />
                          ) : (
                            <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          )}
                        </div>
                        {/* Badge do canal */}
                        <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center ${
                          (conversation as any).channel === 'instagram' 
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                            : 'bg-green-500'
                        }`}>
                          {(conversation as any).channel === 'instagram' ? (
                            <Instagram className="h-2 w-2 text-white" />
                          ) : (
                            <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{conversation.contactName}</h3>
                        <p className="text-xs text-gray-500">
                          {(conversation as any).channel === 'instagram' 
                            ? `@${(conversation as any).contactId?.substring(0, 12) || 'instagram'}` 
                            : conversation.phoneNumber}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(conversation.status)}`}>
                      {getStatusText(conversation.status)}
                    </span>
                  </div>
                  
                  {conversation.lastMessage && (
                    <p className="text-sm text-gray-600 truncate ml-13">
                      {conversation.lastMessage.content}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mt-2 ml-13">
                    <span className="text-xs text-gray-400 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {(() => {
                        try {
                          // Para conversas encerradas, mostrar data de encerramento
                          const dateToShow = conversation.status === 'closed' && conversation.closedAt 
                            ? conversation.closedAt 
                            : conversation.updatedAt;
                          
                          let date: Date;
                          if (dateToShow instanceof Date) {
                            date = dateToShow;
                          } else if (typeof dateToShow === 'string') {
                            date = new Date(dateToShow);
                          } else if ((dateToShow as any)?._seconds) {
                            date = new Date((dateToShow as any)._seconds * 1000);
                          } else if ((dateToShow as any)?.toDate) {
                            date = (dateToShow as any).toDate();
                          } else {
                            date = new Date(dateToShow);
                          }
                          
                          if (isNaN(date.getTime())) {
                            return '--/--';
                          }
                          
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                          
                          // Se for hoje, mostrar apenas hora
                          if (messageDate.getTime() === today.getTime()) {
                            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                          }
                          
                          // Se for ontem
                          const yesterday = new Date(today);
                          yesterday.setDate(yesterday.getDate() - 1);
                          if (messageDate.getTime() === yesterday.getTime()) {
                            return 'Ontem';
                          }
                          
                          // Se for esta semana, mostrar dia da semana
                          const weekAgo = new Date(today);
                          weekAgo.setDate(weekAgo.getDate() - 7);
                          if (messageDate > weekAgo) {
                            return date.toLocaleDateString('pt-BR', { weekday: 'short' });
                          }
                          
                          // Caso contrário, mostrar data completa
                          return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        } catch (error) {
                          console.error('Erro ao formatar data:', error);
                          return '--/--';
                        }
                      })()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!showMobileChat && selectedConversation ? 'hidden md:flex' : 'flex'}`}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {/* Botão Voltar Mobile */}
                    <button
                      onClick={() => setShowMobileChat(false)}
                      className="md:hidden mr-3 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="h-5 w-5 text-gray-600" />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                      <User className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{selectedConversation.contactName}</h3>
                      <p className="text-sm text-gray-500">{selectedConversation.phoneNumber}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedConversation.status)}`}>
                      {getStatusText(selectedConversation.status)}
                    </span>
                    
                    {/* Botão de Aceitar Conversa (apenas para conversas com bot) */}
                    {selectedConversation.status === 'bot' && (
                      <button
                        onClick={handleAcceptConversation}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm"
                        title="Aceitar e assumir controle"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">Aceitar</span>
                      </button>
                    )}
                    
                    {/* Botão de Transferir Conversa */}
                    {selectedConversation.status !== 'closed' && selectedConversation.status !== 'bot' && (
                      <button
                        onClick={() => setShowTransferModal(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        title="Transferir conversa"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Transferir</span>
                      </button>
                    )}
                    
                    {/* Botão de Fechar Conversa */}
                    {selectedConversation.status !== 'closed' && (
                      <button
                        onClick={handleCloseConversation}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                        title="Encerrar conversa"
                      >
                        <X className="h-4 w-4" />
                        <span className="hidden sm:inline">Encerrar</span>
                      </button>
                    )}
                    
                    {/* Badge de Conversa Encerrada */}
                    {selectedConversation.status === 'closed' && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg">
                        <CheckCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">Encerrada</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-gray-100">
                {loadingMessages ? (
                  <MessageSkeleton />
                ) : messages[selectedConversation.id]?.length > 0 ? (
                  messages[selectedConversation.id].map((message: Message, index: number) => {
                    const messageType = (message as any).type;
                    
                    // Mensagem de sistema (transferência, etc)
                    if (messageType === 'system') {
                      return (
                        <div key={message.id} className="flex justify-center my-4 animate-fade-in">
                          <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg max-w-md">
                            <p className="text-xs text-blue-700 text-center">{message.content}</p>
                          </div>
                        </div>
                      );
                    }

                    // ✅ CORRIGIDO: Cliente = esquerda (cinza), Sistema = direita (azul)
                    const isFromClient = !message.isFromBot; // Cliente = NÃO é do bot
                    
                    console.log(`Renderizando mensagem ${index + 1}:`, {
                      content: message.content?.substring(0, 30),
                      isFromBot: message.isFromBot,
                      isFromClient,
                      align: isFromClient ? 'ESQUERDA (cliente)' : 'DIREITA (sistema)',
                    });

                    // Mensagem normal
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isFromClient ? 'justify-start' : 'justify-end'} animate-fade-in`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                            isFromClient
                              ? 'bg-white text-gray-900 border border-gray-200'
                              : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <span className={`text-xs mt-1 block ${isFromClient ? 'text-gray-400' : 'text-indigo-100'}`}>
                            {formatMessageTime(message.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhuma mensagem ainda</p>
                      <p className="text-xs mt-1">Envie uma mensagem para iniciar a conversa</p>
                    </div>
                  </div>
                )}
                {/* Ref para scroll automático */}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="bg-white border-t border-gray-200 p-4 shadow-lg">
                {selectedConversation.status === 'closed' ? (
                  <div className="flex items-center justify-center py-4 text-gray-500">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    <span>Esta conversa foi encerrada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                      <Smile className="h-5 w-5" />
                    </button>
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim()}
                      className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                    >
                      <Send className="h-4 w-4" />
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-400">
                <MessageCircle className="h-16 w-16 mx-auto mb-4" />
                <p className="text-lg font-medium">Selecione uma conversa</p>
                <p className="text-sm">Escolha uma conversa da lista para começar</p>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Modal de Transferência */}
        {selectedConversation && (
          <TransferModal
            conversationId={selectedConversation.id}
            isOpen={showTransferModal}
            onClose={() => setShowTransferModal(false)}
            onSuccess={() => {
              fetchConversations();
              if (selectedConversation) {
                fetchMessages(selectedConversation.id);
              }
            }}
          />
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
