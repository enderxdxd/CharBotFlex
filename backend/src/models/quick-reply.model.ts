export interface IQuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string; // Ex: "/oi" para expandir
  departmentId?: string;
  createdBy: string;
  usageCount: number;
  tags: string[];
  isGlobal: boolean; // Se true, disponível para todos
  createdAt: Date;
  updatedAt: Date;
}

export interface IQuickReplyInput {
  title: string;
  content: string;
  shortcut: string;
  departmentId?: string;
  tags?: string[];
  isGlobal?: boolean;
}
