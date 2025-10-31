import { Response } from 'express';
import { AuthRequest } from '../types/index.js';
import { DepartmentService } from '../services/department.service.js';
import logger from '../utils/logger.js';

const departmentService = new DepartmentService();

export const getAllDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const departments = await departmentService.getAllDepartments();
    
    res.json({
      success: true,
      data: departments,
    });
  } catch (error) {
    logger.error('Erro ao buscar departamentos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar departamentos',
    });
  }
};

export const getDepartmentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const department = await departmentService.getDepartmentById(id);
    
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Departamento não encontrado',
      });
    }
    
    res.json({
      success: true,
      data: department,
    });
  } catch (error) {
    logger.error('Erro ao buscar departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar departamento',
    });
  }
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, distributionStrategy, maxChatsPerUser } = req.body;
    
    if (!name || !distributionStrategy) {
      return res.status(400).json({
        success: false,
        error: 'Nome e estratégia de distribuição são obrigatórios',
      });
    }
    
    const department = await departmentService.createDepartment({
      name,
      description: description || '',
      distributionStrategy,
      maxChatsPerUser: maxChatsPerUser || 5,
    });
    
    res.status(201).json({
      success: true,
      data: department,
      message: 'Departamento criado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao criar departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar departamento',
    });
  }
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    await departmentService.updateDepartment(id, updateData);
    
    res.json({
      success: true,
      message: 'Departamento atualizado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar departamento',
    });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await departmentService.deleteDepartment(id);
    
    res.json({
      success: true,
      message: 'Departamento deletado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao deletar departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar departamento',
    });
  }
};

export const addUserToDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'ID do usuário é obrigatório',
      });
    }
    
    await departmentService.addUserToDepartment(id, userId);
    
    res.json({
      success: true,
      message: 'Usuário adicionado ao departamento',
    });
  } catch (error) {
    logger.error('Erro ao adicionar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao adicionar usuário ao departamento',
    });
  }
};

export const removeUserFromDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    
    await departmentService.removeUserFromDepartment(id, userId);
    
    res.json({
      success: true,
      message: 'Usuário removido do departamento',
    });
  } catch (error) {
    logger.error('Erro ao remover usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao remover usuário do departamento',
    });
  }
};

export const getAvailableUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const users = await departmentService.getAvailableUsers(id);
    
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Erro ao buscar usuários disponíveis:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar usuários disponíveis',
    });
  }
};

export const transferToDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, departmentId } = req.body;
    
    if (!conversationId || !departmentId) {
      return res.status(400).json({
        success: false,
        error: 'ID da conversa e departamento são obrigatórios',
      });
    }
    
    // Selecionar usuário baseado na estratégia do departamento
    const selectedUserId = await departmentService.selectUserForChat(departmentId);
    
    if (!selectedUserId) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum usuário disponível no departamento',
      });
    }
    
    // Atualizar conversa com novo atendente
    const { db, collections } = require('../config/firebase');
    await db.collection(collections.conversations).doc(conversationId).update({
      assignedTo: selectedUserId,
      status: 'human',
      departmentId,
      updatedAt: new Date(),
    });
    
    logger.info(`✅ Conversa ${conversationId} transferida para usuário ${selectedUserId}`);
    
    res.json({
      success: true,
      message: 'Conversa transferida com sucesso',
      data: {
        assignedTo: selectedUserId,
        departmentId,
      },
    });
  } catch (error) {
    logger.error('Erro ao transferir para departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao transferir conversa',
    });
  }
};
