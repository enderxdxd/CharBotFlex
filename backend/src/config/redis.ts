import Redis from 'ioredis';
import logger from '../utils/logger';

let redis: Redis | null = null;

// Apenas inicializar Redis se as variáveis estiverem configuradas
if (process.env.REDIS_HOST) {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true, // Não conectar imediatamente
    });

    redis.on('connect', () => {
      logger.info('✅ Redis conectado');
    });

    redis.on('error', (err) => {
      logger.error('❌ Erro no Redis:', err.message);
    });

    // Tentar conectar
    redis.connect().catch((err) => {
      logger.warn('⚠️  Redis não disponível:', err.message);
      redis = null;
    });
  } catch (error: any) {
    logger.warn('⚠️  Falha ao inicializar Redis:', error.message);
    redis = null;
  }
} else {
  logger.info('ℹ️  Redis não configurado - funcionando sem cache');
}

export default redis;
