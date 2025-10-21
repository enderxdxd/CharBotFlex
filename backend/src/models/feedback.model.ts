export interface IFeedback {
  id: string;
  conversationId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  operatorId: string;
  operatorName: string;
  customerPhone: string;
  customerName?: string;
  createdAt: Date;
}

export interface IFeedbackInput {
  conversationId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface IFeedbackStats {
  totalFeedbacks: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  positivePercentage: number; // 4 e 5 estrelas
  negativePercentage: number; // 1 e 2 estrelas
}
