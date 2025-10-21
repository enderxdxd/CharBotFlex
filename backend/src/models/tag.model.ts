export type TagCategory = 'issue' | 'priority' | 'department' | 'custom';

export interface ITag {
  id: string;
  name: string;
  color: string;
  category: TagCategory;
  conversationCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITagInput {
  name: string;
  color: string;
  category: TagCategory;
}
