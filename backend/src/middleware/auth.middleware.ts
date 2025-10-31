import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase.js';
import { UserService } from '../services/user.service.js';
import { AuthRequest } from '../types/index.js';
import logger from '../utils/logger.js';

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
      // Se Firebase NÃO está configurado, usa modo dev
      if (isDevelopment && !firebaseConfigured) {
        logger.warn('⚠️  Modo dev: Bypass de autenticação ativado (Firebase não configurado)');
        
        // Tenta extrair informações do token se possível
        try {
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
      
      // Firebase configurado: validação real
      logger.info('🔐 Validando token no Firebase...');
      
      // Validar token com checkRevoked: false para não invalidar tokens rapidamente
      const decodedToken = await auth.verifyIdToken(token, false);
      
      // Buscar dados completos do usuário
      const user = await userService.getUserById(decodedToken.uid);

      if (!user) {
        // Se usuário não existe no banco, criar automaticamente no Firestore
        logger.info(`Criando usuário automaticamente: ${decodedToken.email}`);
        
        const newUser = {
          uid: decodedToken.uid,
          email: decodedToken.email || '',
          name: decodedToken.name || decodedToken.email || 'Usuário',
          role: 'admin' as const, // Primeiro usuário é admin
          phone: decodedToken.phone_number || '',
          status: 'online' as const,
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
        
        // Salvar diretamente no Firestore
        const { db, collections } = require('../config/firebase');
        await db.collection(collections.users).doc(decodedToken.uid).set(newUser);
        
        logger.info(`✅ Usuário criado automaticamente: ${newUser.email}`);
        req.user = newUser;
      } else {
        req.user = user;
      }
      
      next();
    } catch (verifyError: any) {
      // Log detalhado do erro
      logger.error('Erro ao verificar token:', {
        code: verifyError.code,
        message: verifyError.message,
      });
      
      // Se for erro de token expirado, retornar mensagem específica
      if (verifyError.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          error: 'Token expirado. Por favor, faça login novamente.',
          code: 'TOKEN_EXPIRED',
        });
      }
      
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