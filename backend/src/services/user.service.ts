import { auth, db, collections } from '../config/firebase';
import { IUser, UserRole, UserStatus } from '../types';
import logger from '../utils/logger';

export class UserService {
  async getAllUsers(filters?: { role?: string; status?: string }): Promise<IUser[]> {
    try {
      let query = db.collection(collections.users);

      if (filters?.role) {
        query = query.where('role', '==', filters.role) as any;
      }

      if (filters?.status) {
        query = query.where('status', '==', filters.status) as any;
      }

      const snapshot = await query.get();
      
      return snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data(),
      })) as IUser[];
    } catch (error) {
      logger.error('Erro ao buscar usuários:', error);
      throw error;
    }
  }

  async getUserById(uid: string): Promise<IUser | null> {
    try {
      const doc = await db.collection(collections.users).doc(uid).get();

      if (!doc.exists) {
        return null;
      }

      return {
        uid: doc.id,
        ...doc.data(),
      } as IUser;
    } catch (error) {
      logger.error('Erro ao buscar usuário:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    try {
      const snapshot = await db.collection(collections.users)
        .where('email', '==', email)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return {
        uid: doc.id,
        ...doc.data(),
      } as IUser;
    } catch (error) {
      logger.error('Erro ao buscar usuário por email:', error);
      throw error;
    }
  }

  async createUser(userData: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    phone: string;
    maxChats?: number;
    permissions?: any;
  }): Promise<IUser> {
    try {
      // Criar usuário no Firebase Auth
      const userRecord = await auth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.name,
      });

      // Criar documento no Firestore
      const user: Omit<IUser, 'uid'> = {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        phone: userData.phone,
        status: 'offline',
        maxChats: userData.maxChats || 5,
        currentChats: 0,
        permissions: userData.permissions || {
          canTransfer: true,
          canViewReports: userData.role !== 'operator',
          canManageUsers: userData.role === 'admin',
          canManageBotFlow: userData.role === 'admin',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection(collections.users).doc(userRecord.uid).set(user);

      logger.info(`Usuário criado: ${userRecord.uid}`);

      return {
        uid: userRecord.uid,
        ...user,
      };
    } catch (error: any) {
      logger.error('Erro ao criar usuário:', error);
      throw new Error(error.message || 'Erro ao criar usuário');
    }
  }

  async updateUser(uid: string, updates: Partial<IUser>): Promise<IUser> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await db.collection(collections.users).doc(uid).update(updateData);

      // Buscar usuário atualizado
      const user = await this.getUserById(uid);

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      logger.info(`Usuário atualizado: ${uid}`);

      return user;
    } catch (error) {
      logger.error('Erro ao atualizar usuário:', error);
      throw error;
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      // Deletar do Firebase Auth
      await auth.deleteUser(uid);

      // Deletar do Firestore
      await db.collection(collections.users).doc(uid).delete();

      logger.info(`Usuário deletado: ${uid}`);
    } catch (error) {
      logger.error('Erro ao deletar usuário:', error);
      throw error;
    }
  }

  async updateUserStatus(uid: string, status: UserStatus): Promise<void> {
    try {
      await db.collection(collections.users).doc(uid).update({
        status,
        updatedAt: new Date(),
      });

      logger.info(`Status do usuário ${uid} atualizado para: ${status}`);
    } catch (error) {
      logger.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  async incrementCurrentChats(uid: string): Promise<void> {
    try {
      await db.collection(collections.users).doc(uid).update({
        currentChats: (await this.getUserById(uid))!.currentChats + 1,
      });
    } catch (error) {
      logger.error('Erro ao incrementar chats:', error);
      throw error;
    }
  }

  async decrementCurrentChats(uid: string): Promise<void> {
    try {
      const user = await this.getUserById(uid);
      if (user && user.currentChats > 0) {
        await db.collection(collections.users).doc(uid).update({
          currentChats: user.currentChats - 1,
        });
      }
    } catch (error) {
      logger.error('Erro ao decrementar chats:', error);
      throw error;
    }
  }
}