import cron from 'node-cron';
import { ConversationAutoCloseService } from '../services/conversation-auto-close.service.js';
import logger from '../utils/logger.js';

const autoCloseService = new ConversationAutoCloseService();

/**
 * Job para verificar e fechar conversas inativas
 * Executa a cada 5 minutos
 */
export const startConversationAutoCloseJob = (): void => {
  // Executa a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('🤖 Iniciando job de auto-fechamento de conversas...');
      await autoCloseService.checkAndCloseInactiveConversations();
    } catch (error) {
      logger.error('❌ Erro no job de auto-fechamento:', error);
    }
  });

  logger.info('✅ Job de auto-fechamento de conversas iniciado (executa a cada 5 minutos)');
};

/**
 * Job alternativo para executar a cada 10 minutos (mais leve)
 */
export const startConversationAutoCloseJobLight = (): void => {
  // Executa a cada 10 minutos
  cron.schedule('*/10 * * * *', async () => {
    try {
      logger.info('🤖 Iniciando job de auto-fechamento de conversas...');
      await autoCloseService.checkAndCloseInactiveConversations();
    } catch (error) {
      logger.error('❌ Erro no job de auto-fechamento:', error);
    }
  });

  logger.info('✅ Job de auto-fechamento de conversas iniciado (executa a cada 10 minutos)');
};

/**
 * Executa verificação manual (útil para testes)
 */
export const runManualCheck = async (): Promise<void> => {
  try {
    logger.info('🔧 Executando verificação manual de conversas inativas...');
    await autoCloseService.checkAndCloseInactiveConversations();
  } catch (error) {
    logger.error('❌ Erro na verificação manual:', error);
    throw error;
  }
};
