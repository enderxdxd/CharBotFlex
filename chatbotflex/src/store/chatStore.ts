import { create } from 'zustand';
import { Conversation, Message } from '@/types';
import api from '@/lib/api';

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  selectedConversation: Conversation | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  setConversations: (conversations: Conversation[]) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  setSelectedConversation: (conversation: Conversation | null) => void;
  addMessage: (message: Message) => void;
  updateConversation: (conversation: Conversation) => void;
  
  // API Calls
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, type?: string) => Promise<void>;
  closeConversation: (conversationId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  selectedConversation: null,
  loading: false,
  error: null,

  setConversations: (conversations) => set({ conversations }),
  
  setMessages: (conversationId, messages) => 
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    })),
  
  setSelectedConversation: (conversation) => 
    set({ selectedConversation: conversation }),
  
  addMessage: (message) => {
    set((state) => {
      const conversationMessages = state.messages[message.conversationId] || [];
      
      return {
        messages: {
          ...state.messages,
          [message.conversationId]: [...conversationMessages, message],
        },
      };
    });
  },
  
  updateConversation: (conversation) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversation.id ? conversation : conv
      ),
      selectedConversation: 
        state.selectedConversation?.id === conversation.id
          ? conversation
          : state.selectedConversation,
    }));
  },

  fetchConversations: async () => {
    try {
      set({ loading: true, error: null });
      
      const response = await api.get('/conversations');
      
      if (response.data.success) {
        set({ conversations: response.data.data, loading: false });
      }
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Erro ao buscar conversas',
        loading: false 
      });
    }
  },

  fetchMessages: async (conversationId: string) => {
    try {
      console.log('🔍 Buscando mensagens para conversa:', conversationId);
      set({ loading: true, error: null });
      
      const response = await api.get(`/conversations/${conversationId}/messages`);
      
      console.log('📨 Resposta da API:', response.data);
      
      if (response.data.success) {
        console.log('✅ Mensagens recebidas:', response.data.data.length);
        
        // 🔍 DEBUG: Verificar isFromBot de cada mensagem
        response.data.data.forEach((msg: any, index: number) => {
          console.log(`Mensagem ${index + 1}:`, {
            content: msg.content?.substring(0, 30),
            isFromBot: msg.isFromBot,
            senderId: msg.senderId,
          });
        });
        
        get().setMessages(conversationId, response.data.data);
        set({ loading: false });
      }
    } catch (error: any) {
      console.error('❌ Erro ao buscar mensagens:', error);
      console.error('Detalhes do erro:', error.response?.data);
      set({ 
        error: error.response?.data?.error || 'Erro ao buscar mensagens',
        loading: false 
      });
    }
  },

  sendMessage: async (conversationId: string, content: string, type: string = 'text') => {
    try {
      console.log('📝 Enviando mensagem para conversa:', conversationId);
      const response = await api.post(`/conversations/${conversationId}/messages`, {
        content,
        type,
      });
      
      if (response.data.success) {
        get().addMessage(response.data.data);
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Erro ao enviar mensagem');
    }
  },

  closeConversation: async (conversationId: string) => {
    try {
      const response = await api.post(`/conversations/${conversationId}/close`);
      
      if (response.data.success) {
        get().updateConversation(response.data.data);
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Erro ao encerrar conversa');
    }
  },
}));