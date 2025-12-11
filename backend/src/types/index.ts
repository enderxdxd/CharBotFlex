export type UserRole = 'admin' | 'supervisor' | 'operator';
export type UserStatus = 'online' | 'offline' | 'busy';
export type ConversationStatus = 'bot' | 'human' | 'waiting' | 'closed';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type ChannelType = 'whatsapp' | 'instagram';
export type InstagramMessageType = 'text' | 'image' | 'video' | 'audio' | 'story_mention' | 'story_reply';

export interface IUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  avatar?: string;
  status: UserStatus;
  maxChats: number;
  currentChats: number;
  permissions: IPermissions;
  requirePasswordReset?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPermissions {
  canTransfer: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canManageBotFlow: boolean;
}

export interface IConversation {
  id: string;
  phoneNumber: string;      // Para WhatsApp
  contactId?: string;       // Para Instagram (IGSID)
  contactName: string;
  contactAvatar?: string;   // Avatar do Instagram
  status: ConversationStatus;
  assignedTo?: string;
  context: IConversationContext;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
  source: 'baileys' | 'official';
  channel: ChannelType;     // Canal: whatsapp ou instagram
  lastMessage?: IMessage;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationContext {
  stage: string;
  userData: Record<string, any>;
  lastIntent: string;
}

export interface IMessage {
  id: string;
  conversationId: string;
  from: string;
  to: string;
  type: MessageType | InstagramMessageType;
  content: string;
  mediaUrl?: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  channel?: ChannelType;    // Canal de origem da mensagem
}

// ==================== INSTAGRAM TYPES ====================

export interface IInstagramConfig {
  id: string;
  pageId: string;           // ID da página do Facebook
  instagramAccountId: string; // ID da conta do Instagram
  accessToken: string;      // Token de acesso (longa duração)
  pageName?: string;
  instagramUsername?: string;
  isActive: boolean;
  webhookVerifyToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInstagramMessage {
  id: string;               // Message ID do Instagram
 visitorId: string;        // IGSID do usuário
  pageId: string;           // ID da página
  timestamp: number;
  text?: string;
  attachments?: IInstagramAttachment[];
  storyMention?: IInstagramStoryMention;
  storyReply?: IInstagramStoryReply;
}

export interface IInstagramAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  payload: {
    url: string;
  };
}

export interface IInstagramStoryMention {
  link: string;             // URL da story
  id: string;               // ID da story
}

export interface IInstagramStoryReply {
  link: string;             // URL da story
  id: string;               // ID da story
}

export interface IInstagramWebhookEvent {
  object: 'instagram';
  entry: IInstagramWebhookEntry[];
}

export interface IInstagramWebhookEntry {
  id: string;               // Page ID
  time: number;
  messaging: IInstagramMessagingEvent[];
}

export interface IInstagramMessagingEvent {
  sender: { id: string };   // IGSID do remetente
  recipient: { id: string }; // IGSID do destinatário (página)
  timestamp: number;
  message?: {
    mid: string;            // Message ID
    text?: string;
    attachments?: IInstagramAttachment[];
    is_echo?: boolean;      // True se foi enviada pela página
    reply_to?: { mid: string };
  };
  postback?: {
    mid: string;
    title: string;
    payload: string;
  };
  read?: {
    watermark: number;      // Timestamp até onde foi lido
  };
}

export interface IFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
}

export interface IBotFlow {
  id: string;
  name: string;
  isActive: boolean;
  trigger: ITrigger;
  nodes: IFlowNode[];
  edges?: IFlowEdge[]; // Conexões entre nodes (ReactFlow)
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrigger {
  type: 'keyword' | 'intent';
  value: string;
}

export interface IFlowNode {
  id: string;
  type: 'message' | 'menu' | 'question' | 'condition' | 'transfer' | 'trigger' | 'input' | 'end';
  content: string;
  options?: string[];
  nextNode?: string;
  conditions?: any[];
  data?: Record<string, any>; // Dados adicionais do node (keywords, validation, etc)
}

export interface ITransfer {
  id: string;
  conversationId: string;
  fromUser: string;
  toUser?: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardStats {
  activeChats: number;
  waitingChats: number;
  closedToday: number;
  averageResponseTime: number;
  operatorsOnline: number;
  botAccuracy: number;
}

export interface AuthRequest {
  user?: IUser;
  params: { [key: string]: string };
  query: { [key: string]: any };
  body: any;
  headers: { [key: string]: string };
}
