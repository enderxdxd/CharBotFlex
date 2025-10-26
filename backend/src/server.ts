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

// Configurar variáveis de ambiente
dotenv.config();

const app = express();
const server = createServer(app);

// Configurar Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middlewares globais
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
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
