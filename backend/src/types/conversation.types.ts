export interface IConversation {
  id: string;
  phoneNumber: string;
  contactName: string;
  status: 'bot' | 'human' | 'waiting' | 'closed';
  assignedTo?: string; // ID do operador
  assignedToName?: string; // Nome do operador
  departmentId?: string;
  departmentName?: string;
  lastMessage?: {
    id: string;
    content: string;
    timestamp: Date;
    isFromBot: boolean;
  };
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  closedBy?: string; // ID do usuário que fechou
  closureReason?: 'manual' | 'auto' | 'inactivity' | 'resolved';
  tags: string[];
  priority: 'low' | 'medium' | 'high';
  unreadCount: number;
  metadata?: Record<string, any>;
}

export interface IMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  timestamp: Date;
  isFromBot: boolean;
  isRead: boolean;
  metadata?: Record<string, any>;
}

export interface CreateMessageDTO {
  content: string;
  type?: 'text' | 'image' | 'audio' | 'video' | 'document';
  isFromBot?: boolean;
}

export interface CloseConversationDTO {
  reason?: 'manual' | 'resolved';
  note?: string;
}
