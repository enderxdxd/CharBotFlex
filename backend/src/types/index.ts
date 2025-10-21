export type UserRole = 'admin' | 'supervisor' | 'operator';
export type UserStatus = 'online' | 'offline' | 'busy';
export type ConversationStatus = 'bot' | 'human' | 'waiting' | 'closed';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';

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
  phoneNumber: string;
  contactName: string;
  status: ConversationStatus;
  assignedTo?: string;
  context: IConversationContext;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
  source: 'baileys' | 'official';
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
  type: MessageType;
  content: string;
  mediaUrl?: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface IBotFlow {
  id: string;
  name: string;
  isActive: boolean;
  trigger: ITrigger;
  nodes: IFlowNode[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrigger {
  type: 'keyword' | 'intent';
  value: string;
}

export interface IFlowNode {
  id: string;
  type: 'message' | 'menu' | 'question' | 'condition' | 'transfer';
  content: string;
  options?: string[];
  nextNode?: string;
  conditions?: any[];
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
