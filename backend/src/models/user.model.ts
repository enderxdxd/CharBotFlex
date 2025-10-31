import { IUser, UserRole, UserStatus, IPermissions } from '../types.js';

export class User implements IUser {
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
  createdAt: Date;
  updatedAt: Date;

  constructor(data: IUser) {
    this.uid = data.uid;
    this.email = data.email;
    this.name = data.name;
    this.role = data.role;
    this.phone = data.phone;
    this.avatar = data.avatar;
    this.status = data.status;
    this.maxChats = data.maxChats;
    this.currentChats = data.currentChats;
    this.permissions = data.permissions;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // Verificar se pode receber mais chats
  canReceiveChat(): boolean {
    return this.currentChats < this.maxChats && this.status !== 'offline';
  }

  // Verificar se é admin
  isAdmin(): boolean {
    return this.role === 'admin';
  }

  // Verificar se é supervisor
  isSupervisor(): boolean {
    return this.role === 'supervisor';
  }

  // Verificar permissão específica
  hasPermission(permission: keyof IPermissions): boolean {
    return this.permissions[permission] === true;
  }

  // Converter para objeto simples
  toJSON(): IUser {
    return {
      uid: this.uid,
      email: this.email,
      name: this.name,
      role: this.role,
      phone: this.phone,
      avatar: this.avatar,
      status: this.status,
      maxChats: this.maxChats,
      currentChats: this.currentChats,
      permissions: this.permissions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}