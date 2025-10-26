'use client';

import { useEffect, useState, useRef } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/hooks/useSocket';
import { MessageCircle, Search, Filter, Clock, User, Send, Paperclip, Smile, ArrowLeft, X, CheckCircle, Plus, UserPlus } from 'lucide-react';
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

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         conv.phoneNumber.includes(searchQuery);
    
    // ✅ CORREÇÃO: "Todas" mostra apenas conversas ATIVAS (não encerradas)
    let matchesFilter = false;
    if (filterStatus === 'all') {
      matchesFilter = conv.status !== 'closed'; // Excluir encerradas
    } else if (filterStatus === 'closed') {
      matchesFilter = conv.status === 'closed'; // Apenas encerradas
    } else {
      matchesFilter = conv.status === filterStatus;
    }
    
    return matchesSearch && matchesFilter;
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

            {/* Filters */}
            <div className="flex gap-2">
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
                      <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                        <User className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{conversation.contactName}</h3>
                        <p className="text-xs text-gray-500">{conversation.phoneNumber}</p>
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
                      {new Date(conversation.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                    
                    {/* Botão de Transferir Conversa */}
                    {selectedConversation.status !== 'closed' && (
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

                    // 🔍 DEBUG: Log da mensagem
                    console.log(`Renderizando mensagem ${index + 1}:`, {
                      content: message.content?.substring(0, 30),
                      isFromBot: message.isFromBot,
                      senderId: message.senderId,
                      align: message.isFromBot ? 'ESQUERDA (bot)' : 'DIREITA (user)',
                    });

                    // Mensagem normal
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.isFromBot ? 'justify-start' : 'justify-end'} animate-fade-in`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                            message.isFromBot
                              ? 'bg-white text-gray-900 border border-gray-200'
                              : 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <span className={`text-xs mt-1 block ${message.isFromBot ? 'text-gray-400' : 'text-indigo-100'}`}>
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
