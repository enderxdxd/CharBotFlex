import { Response } from 'express';
import { AuthRequest } from '../types.js';
import { auth } from '../config/firebase.js';
import logger from '../utils/logger.js';

// O backend não faz login/register - isso é feito no frontend
// Aqui apenas validamos tokens e fornecemos informações do usuário

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não autenticado',
      });
    }

    res.json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    logger.error('Erro ao buscar usuário atual:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token não fornecido',
      });
    }

    // Verificar se o token é válido
    const decodedToken = await auth.verifyIdToken(token);
    
    res.json({
      success: true,
      data: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        valid: true,
      },
    });
  } catch (error) {
    logger.error('Erro ao validar token:', error);
    res.status(401).json({
      success: false,
      error: 'Token inválido',
    });
  }
};

export const validateSession = async (req: AuthRequest, res: Response) => {
  try {
    // Se chegou aqui, o middleware de auth já validou o token
    res.json({
      success: true,
      data: {
        valid: true,
        user: req.user,
      },
    });
  } catch (error) {
    logger.error('Erro ao validar sessão:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
};
