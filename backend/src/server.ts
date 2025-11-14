import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { initSocketHandlers } from './socket/socket.handler.js';
import { getWhatsAppManager } from './services/whatsapp/whatsapp.manager.js';
import { startConversationAutoCloseJob } from './jobs/conversation-auto-close.job.js';
import logger from './utils/logger.js';
import { validateEnv } from './config/env.validator.js';

// Configurar variáveis de ambiente
dotenv.config();

// Validar variáveis de ambiente obrigatórias
try {
  validateEnv();
} catch (error: any) {
  logger.error('❌ Falha na validação de variáveis de ambiente:', error.message);
  process.exit(1);
}

const app = express();
const server = createServer(app);

// ========================================
// CONFIGURAÇÃO DE PROXY (Railway/Produção)
// ========================================
app.set('trust proxy', 1); // Atrás de proxy (Railway)

// ========================================
// CONFIGURAÇÃO CORS MELHORADA
// ========================================
const allowedOrigins = [
  'http://localhost:3000',
  'https://char-bot-flex-chatbotflex.vercel.app',
  /^https:\/\/char-bot-flex.*\.vercel\.app$/, // Aceita todos os previews do Vercel
  process.env.FRONTEND_URL
].filter(Boolean);

// Função para verificar origem permitida
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Permite requisições sem origin (Postman, mobile apps)
  
  return allowedOrigins.some(allowed => {
    if (typeof allowed === 'string') {
      return allowed === origin;
    }
    // Se for RegExp
    return allowed.test(origin);
  });
};

// Configurar Socket.IO com configurações de estabilidade
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn(`❌ Origem bloqueada por CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  // ✅ CORREÇÃO: Configurações de heartbeat para manter conexão ativa
  pingTimeout: 60000, // 60 segundos - tempo máximo sem resposta antes de considerar desconectado
  pingInterval: 25000, // 25 segundos - intervalo entre pings
  connectTimeout: 45000, // 45 segundos - timeout para estabelecer conexão
  transports: ['websocket', 'polling'], // Permitir fallback para polling
  allowUpgrades: true, // Permitir upgrade de polling para websocket
  perMessageDeflate: false, // Desabilitar compressão para melhor performance
  httpCompression: false,
  // Configurações de reconexão
  maxHttpBufferSize: 1e8, // 100 MB
});

// Middlewares globais - CORS COMPLETO
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.warn(`❌ Origem bloqueada por CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // Cache preflight por 24 horas
}));

// Tratar explicitamente preflight OPTIONS
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de CORS explícito (fallback)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Rotas da API
app.use('/api', routes);

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'CharBotFlex Backend'
  });
});

// Middleware de tratamento de erros
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Erro não tratado:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });
  
  const statusCode = err.status || err.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && {
      details: err.details || err.stack,
      path: req.path
    })
  });
});

// Configurar Socket.IO handlers
initSocketHandlers(io);

// Inicializar WhatsApp Manager e Jobs
async function initializeServices() {
  try {
    const whatsappManager = getWhatsAppManager();
    
    // Injetar Socket.IO no WhatsAppManager
    whatsappManager.setSocketIO(io);
    
    // Tentar inicializar WhatsApp (não crashar se falhar)
    try {
      await whatsappManager.initialize();
      logger.info('✅ WhatsApp Manager inicializado');
    } catch (whatsappError) {
      logger.warn('⚠️ Erro ao inicializar WhatsApp (servidor continua rodando):', whatsappError);
      logger.info('💡 Você pode conectar o WhatsApp depois via /api/whatsapp/qr');
    }
    
    // Iniciar job de auto-fechamento de conversas
    startConversationAutoCloseJob();
    
    logger.info('✅ Serviços inicializados com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao inicializar serviços (servidor continua rodando):', error);
    logger.info('💡 Algumas funcionalidades podem estar limitadas');
  }
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  logger.info(`🚀 Servidor CharBotFlex rodando na porta ${PORT}`);
  logger.info(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  
  // Mostrar origens CORS permitidas
  const originsDisplay = allowedOrigins.map(o => 
    typeof o === 'string' ? o : o.toString()
  ).join(', ');
  logger.info(`🌐 Origens CORS permitidas: ${originsDisplay}`);
  
  // Inicializar serviços
  await initializeServices();
});

// ========================================
// TRATAMENTO GLOBAL DE ERROS (ANTI-CRASH)
// ========================================

// Capturar erros não tratados (previne crash do Railway)
process.on('uncaughtException', (error: Error) => {
  logger.error('❌ Uncaught Exception (NÃO VAI CRASHAR):', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  
  // Se for erro do Baileys/WebSocket, apenas logar
  const isBaileysError = error.message?.includes('Stream Errored') ||
                        error.message?.includes('Connection') ||
                        error.message?.includes('WebSocket') ||
                        error.stack?.includes('baileys');
  
  if (isBaileysError) {
    logger.warn('⚠️ Erro do Baileys detectado - Servidor continua rodando');
    logger.info('💡 O WhatsApp vai tentar reconectar automaticamente');
    return; // NÃO crashar
  }
  
  // Para outros erros críticos, logar mas também não crashar
  logger.error('⚠️ Erro crítico detectado, mas servidor continua rodando');
});

// Capturar promises rejeitadas não tratadas
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('❌ Unhandled Promise Rejection (NÃO VAI CRASHAR):', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
  
  // Se for erro do Baileys/WebSocket, apenas logar
  const isBaileysError = reason?.message?.includes('Stream Errored') ||
                        reason?.message?.includes('Connection') ||
                        reason?.message?.includes('WebSocket') ||
                        reason?.stack?.includes('baileys');
  
  if (isBaileysError) {
    logger.warn('⚠️ Promise rejeitada do Baileys - Servidor continua rodando');
    logger.info('💡 O WhatsApp vai tentar reconectar automaticamente');
    return; // NÃO crashar
  }
  
  logger.warn('⚠️ Promise rejeitada detectada, mas servidor continua rodando');
});

// Capturar avisos
process.on('warning', (warning: Error) => {
  logger.warn('⚠️ Node.js Warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

// Tratamento de sinais do sistema (graceful shutdown)
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM recebido, encerrando servidor gracefully...');
  
  try {
    // Fechar servidor HTTP
    server.close(() => {
      logger.info('✅ Servidor HTTP encerrado');
    });
    
    // Desconectar WhatsApp
    const whatsappManager = getWhatsAppManager();
    await whatsappManager.disconnect();
    logger.info('✅ WhatsApp desconectado');
    
    // Aguardar 2 segundos para finalizar operações
    setTimeout(() => {
      logger.info('👋 Servidor encerrado completamente');
      process.exit(0);
    }, 2000);
  } catch (error) {
    logger.error('❌ Erro ao encerrar servidor:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT recebido, encerrando servidor gracefully...');
  
  try {
    // Fechar servidor HTTP
    server.close(() => {
      logger.info('✅ Servidor HTTP encerrado');
    });
    
    // Desconectar WhatsApp
    const whatsappManager = getWhatsAppManager();
    await whatsappManager.disconnect();
    logger.info('✅ WhatsApp desconectado');
    
    // Aguardar 2 segundos para finalizar operações
    setTimeout(() => {
      logger.info('👋 Servidor encerrado completamente');
      process.exit(0);
    }, 2000);
  } catch (error) {
    logger.error('❌ Erro ao encerrar servidor:', error);
    process.exit(1);
  }
});

// Log de inicialização bem-sucedida
logger.info('🛡️ Proteção anti-crash ativada');
logger.info('✅ Erros do Baileys não vão derrubar o servidor');

export { app, io };
