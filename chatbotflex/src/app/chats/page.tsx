'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/hooks/useSocket';
import { MessageCircle, Search, Filter, Clock, User, Send, Paperclip, Smile } from 'lucide-react';
import { Conversation, Message } from '@/types';

export default function ChatsPage() {
  const { conversations, messages, selectedConversation, fetchConversations, fetchMessages, sendMessage, setSelectedConversation } = useChatStore();
  const socket = useSocket();
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (data: any) => {
      if (selectedConversation && data.conversationId === selectedConversation.id) {
        fetchMessages(selectedConversation.id);
      }
      fetchConversations();
    });

    return () => {
      socket.off('message:new');
    };
  }, [socket, selectedConversation]);

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    await fetchMessages(conversation.id);
    
    if (socket) {
      socket.emit('conversation:join', conversation.id);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    try {
      await sendMessage(selectedConversation.id, messageInput);
      setMessageInput('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         conv.phoneNumber.includes(searchQuery);
    const matchesFilter = filterStatus === 'all' || conv.status === filterStatus;
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
      <div className="h-screen flex bg-gray-50">
        {/* Lista de Conversas */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Conversas</h2>
            
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conversas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${
                  filterStatus === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterStatus('waiting')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${
                  filterStatus === 'waiting' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Aguardando
              </button>
              <button
                onClick={() => setFilterStatus('human')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${
                  filterStatus === 'human' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Ativas
              </button>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageCircle className="h-12 w-12 mb-2" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedConversation?.id === conversation.id ? 'bg-indigo-50' : ''
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
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
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
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages[selectedConversation.id]?.map((message: Message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isFromBot ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.isFromBot
                          ? 'bg-white text-gray-900 border border-gray-200'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <span className={`text-xs mt-1 block ${message.isFromBot ? 'text-gray-400' : 'text-indigo-100'}`}>
                        {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message Input */}
              <div className="bg-white border-t border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                    <Smile className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                </div>
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
    </ProtectedRoute>
  );
}
