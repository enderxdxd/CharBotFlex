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

// Configurar Socket.IO
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
  }
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
    await whatsappManager.initialize();
    
    // Iniciar job de auto-fechamento de conversas
    startConversationAutoCloseJob();
    
    logger.info('✅ Serviços inicializados com sucesso');
  } catch (error) {
    logger.error('❌ Erro ao inicializar serviços:', error);
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

// Tratamento de sinais do sistema
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

export { app, io };
