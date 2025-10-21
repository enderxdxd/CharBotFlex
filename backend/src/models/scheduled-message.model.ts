export interface IScheduledMessage {
  id: string;
  phoneNumber: string;
  content: string;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  repeatConfig?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    until: Date;
  };
  createdBy: string;
  sentAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledMessageInput {
  phoneNumber: string;
  content: string;
  scheduledFor: Date;
  repeatConfig?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    until: Date;
  };
}
