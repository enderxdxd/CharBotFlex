import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log do erro
  logger.error('Erro capturado:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Se for um erro operacional conhecido
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Erros do Firebase
  if (err.message.includes('auth/')) {
    const firebaseErrors: { [key: string]: string } = {
      'auth/email-already-in-use': 'Este email já está em uso',
      'auth/invalid-email': 'Email inválido',
      'auth/user-not-found': 'Usuário não encontrado',
      'auth/wrong-password': 'Senha incorreta',
      'auth/weak-password': 'Senha muito fraca',
      'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde',
    };

    const errorCode = Object.keys(firebaseErrors).find(code => 
      err.message.includes(code)
    );

    if (errorCode) {
      return res.status(400).json({
        success: false,
        error: firebaseErrors[errorCode],
      });
    }
  }

  // Erro não esperado
  logger.error('Erro não tratado:', err);

  return res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { 
      message: err.message,
      stack: err.stack 
    }),
  });
};

// Middleware para capturar erros assíncronos
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Middleware para rotas não encontradas
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(
    `Rota ${req.originalUrl} não encontrada`,
    404
  );
  next(error);
};
