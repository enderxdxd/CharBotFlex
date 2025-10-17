import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

const userService = new UserService();

// Modo de desenvolvimento - bypass de autenticação
const isDevelopment = process.env.NODE_ENV === 'development';
const firebaseConfigured = process.env.FIREBASE_PROJECT_ID && 
                           process.env.FIREBASE_PROJECT_ID !== 'charbotflex-dev';

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Em desenvolvimento sem Firebase, permite acesso
      if (isDevelopment && !firebaseConfigured) {
        logger.warn('⚠️  Modo dev: Autenticação bypass (Firebase não configurado)');
        req.user = {
          uid: 'dev-user',
          email: 'dev@charbotflex.com',
          name: 'Usuário Dev',
          role: 'admin',
          phone: '',
          status: 'online',
          maxChats: 10,
          currentChats: 0,
          permissions: {
            canTransfer: true,
            canViewReports: true,
            canManageUsers: true,
            canManageBotFlow: true,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        error: 'Token de autenticação não fornecido',
      });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      // Em modo dev, não valida token - apenas cria usuário dev
      if (isDevelopment) {
        logger.warn('⚠️  Modo dev: Bypass de autenticação ativado');
        
        // Tenta extrair informações do token se possível
        try {
          // Decodifica token sem validação (apenas parse do JWT)
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            
            req.user = {
              uid: payload.user_id || payload.sub || 'dev-user',
              email: payload.email || 'dev@charbotflex.com',
              name: payload.name || 'Usuário Dev',
              role: 'admin',
              phone: payload.phone_number || '',
              status: 'online',
              maxChats: 10,
              currentChats: 0,
              permissions: {
                canTransfer: true,
                canViewReports: true,
                canManageUsers: true,
                canManageBotFlow: true,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            logger.info(`✅ Usuário dev criado: ${req.user.email}`);
            return next();
          }
        } catch (parseError) {
          // Ignora erro de parse
        }
        
        // Fallback: usuário dev padrão
        req.user = {
          uid: 'dev-user',
          email: 'dev@charbotflex.com',
          name: 'Usuário Dev',
          role: 'admin',
          phone: '',
          status: 'online',
          maxChats: 10,
          currentChats: 0,
          permissions: {
            canTransfer: true,
            canViewReports: true,
            canManageUsers: true,
            canManageBotFlow: true,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        return next();
      }
      
      // Modo produção: validação normal
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
    } catch (verifyError) {
      throw verifyError;
    }
  } catch (error) {
    logger.error('Erro na autenticação:', error);
    
    return res.status(401).json({
      success: false,
      error: 'Token inválido ou expirado',
    });
  }
};