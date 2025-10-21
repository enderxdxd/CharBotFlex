export type DistributionStrategy = 'balanced' | 'sequential' | 'random';

export interface IDepartment {
  id: string;
  name: string;
  description: string;
  distributionStrategy: DistributionStrategy;
  isActive: boolean;
  userIds: string[]; // IDs dos usuários do departamento
  maxChatsPerUser: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentStats {
  departmentId: string;
  totalUsers: number;
  activeUsers: number;
  totalChats: number;
  averageChatsPerUser: number;
}

export interface UserDepartmentInfo {
  userId: string;
  userName: string;
  currentChats: number;
  maxChats: number;
  isAvailable: boolean;
}
