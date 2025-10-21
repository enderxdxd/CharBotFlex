import { Response } from 'express';
import { AuthRequest } from '../types';
import { UserService } from '../services/user.service';
import logger from '../utils/logger';

const userService = new UserService();

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, status } = req.query;
    
    const users = await userService.getAllUsers({
      role: role as string,
      status: status as string,
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Erro ao buscar usuários:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar usuários',
    });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await userService.getUserById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar usuário',
    });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, phone, maxChats, permissions } = req.body;

    // Verificar se o usuário atual é admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem criar usuários',
      });
    }

    const user = await userService.createUser({
      email,
      password,
      name,
      role,
      phone,
      maxChats,
      permissions,
    });

    res.status(201).json({
      success: true,
      data: user,
      message: 'Usuário criado com sucesso',
    });
  } catch (error: any) {
    logger.error('Erro ao criar usuário:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao criar usuário',
    });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verificar permissões
    if (req.user?.role !== 'admin' && req.user?.uid !== id) {
      return res.status(403).json({
        success: false,
        error: 'Sem permissão para atualizar este usuário',
      });
    }

    const user = await userService.updateUser(id, updates);

    res.json({
      success: true,
      data: user,
      message: 'Usuário atualizado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar usuário',
    });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se o usuário atual é admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem deletar usuários',
      });
    }

    // Não permitir deletar a si mesmo
    if (req.user?.uid === id) {
      return res.status(400).json({
        success: false,
        error: 'Não é possível deletar sua própria conta',
      });
    }

    await userService.deleteUser(id);

    res.json({
      success: true,
      message: 'Usuário deletado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao deletar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar usuário',
    });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Verificar permissões
    if (req.user?.role !== 'admin' && req.user?.uid !== id) {
      return res.status(403).json({
        success: false,
        error: 'Sem permissão para atualizar status deste usuário',
      });
    }

    await userService.updateUserStatus(id, status);

    res.json({
      success: true,
      message: 'Status atualizado com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar status:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar status',
    });
  }
};

export const updateOwnPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { newPassword } = req.body;

    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'A senha deve ter pelo menos 6 caracteres',
      });
    }

    await userService.updatePassword(req.user.uid, newPassword);

    res.json({
      success: true,
      message: 'Senha atualizada com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao atualizar senha:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar senha',
    });
  }
};
