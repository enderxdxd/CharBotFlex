import { db, collections } from '../config/firebase';
import { IDepartment, DistributionStrategy, UserDepartmentInfo } from '../types/department.types';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';

export class DepartmentService {
  async createDepartment(data: {
    name: string;
    description: string;
    distributionStrategy: DistributionStrategy;
    maxChatsPerUser: number;
  }): Promise<IDepartment> {
    try {
      const departmentId = generateId();
      const department: IDepartment = {
        id: departmentId,
        name: data.name,
        description: data.description,
        distributionStrategy: data.distributionStrategy,
        isActive: true,
        userIds: [],
        maxChatsPerUser: data.maxChatsPerUser,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection(collections.departments).doc(departmentId).set(department);
      logger.info(`✅ Departamento criado: ${department.name}`);

      return department;
    } catch (error) {
      logger.error('Erro ao criar departamento:', error);
      throw error;
    }
  }

  async getAllDepartments(): Promise<IDepartment[]> {
    try {
      const snapshot = await db.collection(collections.departments).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IDepartment));
    } catch (error) {
      logger.error('Erro ao buscar departamentos:', error);
      throw error;
    }
  }

  async getDepartmentById(id: string): Promise<IDepartment | null> {
    try {
      const doc = await db.collection(collections.departments).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() } as IDepartment;
    } catch (error) {
      logger.error('Erro ao buscar departamento:', error);
      throw error;
    }
  }

  async updateDepartment(id: string, data: Partial<IDepartment>): Promise<void> {
    try {
      await db.collection(collections.departments).doc(id).update({
        ...data,
        updatedAt: new Date(),
      });
      logger.info(`✅ Departamento atualizado: ${id}`);
    } catch (error) {
      logger.error('Erro ao atualizar departamento:', error);
      throw error;
    }
  }

  async deleteDepartment(id: string): Promise<void> {
    try {
      await db.collection(collections.departments).doc(id).delete();
      logger.info(`✅ Departamento deletado: ${id}`);
    } catch (error) {
      logger.error('Erro ao deletar departamento:', error);
      throw error;
    }
  }

  async addUserToDepartment(departmentId: string, userId: string): Promise<void> {
    try {
      const department = await this.getDepartmentById(departmentId);
      if (!department) throw new Error('Departamento não encontrado');

      if (!department.userIds.includes(userId)) {
        department.userIds.push(userId);
        await this.updateDepartment(departmentId, { userIds: department.userIds });
        
        // Atualizar usuário com departmentId
        await db.collection(collections.users).doc(userId).update({
          departmentId,
          updatedAt: new Date(),
        });
        
        logger.info(`✅ Usuário ${userId} adicionado ao departamento ${departmentId}`);
      }
    } catch (error) {
      logger.error('Erro ao adicionar usuário ao departamento:', error);
      throw error;
    }
  }

  async removeUserFromDepartment(departmentId: string, userId: string): Promise<void> {
    try {
      const department = await this.getDepartmentById(departmentId);
      if (!department) throw new Error('Departamento não encontrado');

      department.userIds = department.userIds.filter(id => id !== userId);
      await this.updateDepartment(departmentId, { userIds: department.userIds });
      
      // Remover departmentId do usuário
      await db.collection(collections.users).doc(userId).update({
        departmentId: null,
        updatedAt: new Date(),
      });
      
      logger.info(`✅ Usuário ${userId} removido do departamento ${departmentId}`);
    } catch (error) {
      logger.error('Erro ao remover usuário do departamento:', error);
      throw error;
    }
  }

  async getAvailableUsers(departmentId: string): Promise<UserDepartmentInfo[]> {
    try {
      const department = await this.getDepartmentById(departmentId);
      if (!department) throw new Error('Departamento não encontrado');

      const users: UserDepartmentInfo[] = [];

      for (const userId of department.userIds) {
        const userDoc = await db.collection(collections.users).doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          users.push({
            userId,
            userName: userData?.name || 'Usuário',
            currentChats: userData?.currentChats || 0,
            maxChats: userData?.maxChats || department.maxChatsPerUser,
            isAvailable: (userData?.currentChats || 0) < (userData?.maxChats || department.maxChatsPerUser),
          });
        }
      }

      return users;
    } catch (error) {
      logger.error('Erro ao buscar usuários disponíveis:', error);
      throw error;
    }
  }

  async selectUserForChat(departmentId: string): Promise<string | null> {
    try {
      const department = await this.getDepartmentById(departmentId);
      if (!department) throw new Error('Departamento não encontrado');

      const availableUsers = await this.getAvailableUsers(departmentId);
      const usersWithCapacity = availableUsers.filter(u => u.isAvailable);

      if (usersWithCapacity.length === 0) {
        logger.warn(`Nenhum usuário disponível no departamento ${departmentId}`);
        return null;
      }

      let selectedUser: UserDepartmentInfo;

      switch (department.distributionStrategy) {
        case 'balanced':
          // Seleciona o usuário com menos conversas
          selectedUser = usersWithCapacity.reduce((prev, current) => 
            prev.currentChats < current.currentChats ? prev : current
          );
          break;

        case 'sequential':
          // Seleciona o primeiro usuário disponível
          selectedUser = usersWithCapacity[0];
          break;

        case 'random':
          // Seleciona aleatoriamente
          const randomIndex = Math.floor(Math.random() * usersWithCapacity.length);
          selectedUser = usersWithCapacity[randomIndex];
          break;

        default:
          selectedUser = usersWithCapacity[0];
      }

      logger.info(`👤 Usuário selecionado: ${selectedUser.userName} (${department.distributionStrategy})`);
      return selectedUser.userId;
    } catch (error) {
      logger.error('Erro ao selecionar usuário:', error);
      throw error;
    }
  }
}
