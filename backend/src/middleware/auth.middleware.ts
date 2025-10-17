import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

const userService = new UserService();

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido',
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verificar token no Firebase Auth
    const decodedToken = await auth.verifyIdToken(token);
    
    // Buscar dados completos do usuário
    const user = await userService.getUserById(decodedToken.uid);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Usuário não encontrado',
      });
    }

    // Adicionar usuário na requisição
    req.user = user;
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação:', error);
    
    return res.status(401).json({
      success: false,
      error: 'Token inválido ou expirado',
    });
  }
};