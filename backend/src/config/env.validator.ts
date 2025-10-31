import logger from '../utils/logger.js';

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  FRONTEND_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  AUTO_CLOSE_CONVERSATION_MINUTES?: number;
  JWT_SECRET?: string;
}

/**
 * Valida variáveis de ambiente obrigatórias
 * Lança erro se alguma variável crítica estiver faltando
 */
export function validateEnv(): EnvConfig {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ];

  const missingVars = requiredVars.filter(varName => {
    const value = process.env[varName];
    return !value || value === '' || value.includes('your-');
  });

  if (missingVars.length > 0) {
    logger.error('❌ Variáveis de ambiente obrigatórias não configuradas:');
    missingVars.forEach(varName => {
      logger.error(`   - ${varName}`);
    });
    logger.error('\n📝 Configure as variáveis no arquivo .env ou no Railway');
    logger.error('📖 Veja o arquivo .env.example para referência\n');
    
    throw new Error(`Variáveis de ambiente obrigatórias não configuradas: ${missingVars.join(', ')}`);
  }

  // Validar formato do Firebase Private Key
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!;
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    logger.error('❌ FIREBASE_PRIVATE_KEY está em formato inválido');
    logger.error('   Deve conter "-----BEGIN PRIVATE KEY-----"');
    throw new Error('FIREBASE_PRIVATE_KEY em formato inválido');
  }

  // Avisos para variáveis opcionais mas recomendadas
  if (!process.env.JWT_SECRET) {
    logger.warn('⚠️  JWT_SECRET não configurado - usando padrão (NÃO RECOMENDADO EM PRODUÇÃO)');
  }

  if (!process.env.REDIS_HOST && process.env.NODE_ENV === 'production') {
    logger.warn('⚠️  Redis não configurado - rate limiting e cache desabilitados');
  }

  logger.info('✅ Variáveis de ambiente validadas com sucesso');

  return {
    PORT: parseInt(process.env.PORT || '3001'),
    NODE_ENV: process.env.NODE_ENV || 'development',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID!,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL!,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY!,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    AUTO_CLOSE_CONVERSATION_MINUTES: process.env.AUTO_CLOSE_CONVERSATION_MINUTES 
      ? parseInt(process.env.AUTO_CLOSE_CONVERSATION_MINUTES) 
      : 60,
    JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  };
}

/**
 * Retorna configuração validada
 */
export const env = validateEnv();
