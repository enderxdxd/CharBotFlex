import { db } from '../config/firebase';
import logger from '../utils/logger';

async function checkMessages() {
  logger.info('🔍 Verificando TODAS as mensagens no Firestore...\n');
  
  const snapshot = await db.collection('messages').get();
  
  let withIsFromBot = 0;
  let withoutIsFromBot = 0;
  let incorrectIsFromBot = 0;
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const senderId = data.senderId;
    const isFromBot = data.isFromBot;
    
    // Verificar se tem isFromBot
    if (isFromBot !== undefined && isFromBot !== null) {
      withIsFromBot++;
      
      // Verificar se está correto
      const shouldBeBot = senderId === 'bot' || senderId === 'system';
      if (isFromBot !== shouldBeBot) {
        incorrectIsFromBot++;
        logger.error(`❌ ERRO: Mensagem ${doc.id}`);
        logger.error(`   senderId: ${senderId}`);
        logger.error(`   isFromBot: ${isFromBot} (deveria ser ${shouldBeBot})`);
        logger.error(`   content: ${data.content?.substring(0, 50)}\n`);
      }
    } else {
      withoutIsFromBot++;
      logger.warn(`⚠️ Mensagem ${doc.id} SEM isFromBot`);
      logger.warn(`   senderId: ${senderId}`);
      logger.warn(`   content: ${data.content?.substring(0, 50)}\n`);
    }
  });
  
  logger.info('\n📊 RESUMO:');
  logger.info(`✅ Mensagens com isFromBot: ${withIsFromBot}`);
  logger.info(`⚠️ Mensagens SEM isFromBot: ${withoutIsFromBot}`);
  logger.info(`❌ Mensagens com isFromBot ERRADO: ${incorrectIsFromBot}`);
  logger.info(`📦 Total: ${snapshot.size}`);
}

checkMessages()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
