export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  isOnline: boolean;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // ID do admin que criou o usuário
}

export interface Message {
  id: string;
  chatId: string;
  conversationId: string; // Adicionado para compatibilidade
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  timestamp: Date;
  isFromBot: boolean;
  isRead: boolean;
}

export interface Chat {
  id: string;
  userId: string;
  operatorId?: string;
  status: 'waiting' | 'active' | 'closed' | 'bot';
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
  unreadCount: number;
}

export interface BotFlow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  nodes: FlowNode[];
  startNodeId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowNode {
  id: string;
  type: 'message' | 'condition' | 'input' | 'transfer';
  content?: string;
  conditions?: any[];
  nextNode?: string;
  options?: string[];
  position: { x: number; y: number };
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
}

export interface DashboardStats {
  activeChats: number;
  waitingChats: number;
  closedToday: number;
  averageResponseTime: number;
  operatorsOnline: number;
  botAccuracy: number;
}

export interface Conversation {
  id: string;
  phoneNumber: string;
  contactName: string;
  status: 'bot' | 'human' | 'waiting' | 'closed';
  assignedTo?: string;
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
}
