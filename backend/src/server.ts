import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import routes from './routes';
import { initSocketHandlers } from './socket/socket.handler';
import { getWhatsAppManager } from './services/whatsapp/whatsapp.manager';
import { startConversationAutoCloseJob } from './jobs/conversation-auto-close.job';
import logger from './utils/logger';
import { validateEnv } from './config/env.validator';

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

// Configurar origens permitidas
const allowedOrigins = [
  'http://localhost:3000',
  'https://char-bot-flex-chatbotflex.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Configurar Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middlewares globais
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`❌ Origem bloqueada por CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de CORS explícito (fallback)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  logger.info(`🌐 Origens CORS permitidas: ${allowedOrigins.join(', ')}`);
  
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
