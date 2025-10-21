export interface IAnalytics {
  totalConversations: number;
  activeConversations: number;
  closedConversations: number;
  averageResponseTime: number; // em segundos
  botResolutionRate: number; // percentual
  satisfactionScore: number; // média de 1-5
  topIssues: Array<{ tag: string; count: number }>;
  peakHours: Array<{ hour: number; count: number }>;
  operatorPerformance: IOperatorPerformance[];
}

export interface IOperatorPerformance {
  operatorId: string;
  operatorName: string;
  totalChats: number;
  averageResponseTime: number;
  satisfactionScore: number;
  resolvedChats: number;
  activeChats: number;
}

export interface IConversationTrend {
  date: string;
  total: number;
  bot: number;
  human: number;
  closed: number;
}
