import rateLimit from 'express-rate-limit';

// Rate limiter geral para API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  message: {
    success: false,
    error: 'Muitas requisições deste IP, tente novamente em 15 minutos',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter mais restritivo para autenticação
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // limite de 5 tentativas
  message: {
    success: false,
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos',
  },
  skipSuccessfulRequests: true, // Não contar requisições bem-sucedidas
});

// Rate limiter para criação de recursos
export const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // limite de 20 criações por hora
  message: {
    success: false,
    error: 'Limite de criação atingido. Tente novamente em 1 hora',
  },
});

// Rate limiter para upload de arquivos
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // limite de 50 uploads por hora
  message: {
    success: false,
    error: 'Limite de upload atingido. Tente novamente em 1 hora',
  },
});
