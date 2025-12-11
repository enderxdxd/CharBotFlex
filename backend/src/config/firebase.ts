import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

// IMPORTANTE: Carregar variáveis de ambiente ANTES de tudo
dotenv.config();

// Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    // Verificar se as credenciais do Firebase estão configuradas
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Debug
    console.log('🔍 Firebase Config Debug:');
    console.log('  - projectId:', projectId);
    console.log('  - clientEmail:', clientEmail ? '✅ Presente' : '❌ Ausente');
    console.log('  - privateKey:', privateKey ? '✅ Presente' : '❌ Ausente');

    if (!projectId || !clientEmail || !privateKey || 
        projectId === 'your-project-id' || 
        clientEmail.includes('your-service-account')) {
      console.warn('⚠️  Firebase não configurado! Usando modo de desenvolvimento.');
      console.warn('⚠️  Configure as credenciais do Firebase no arquivo backend/.env');
      console.warn('⚠️  Algumas funcionalidades podem não funcionar corretamente.');
      
      // Inicializar em modo de desenvolvimento (sem autenticação real)
      admin.initializeApp({
        projectId: 'charbotflex-dev',
      });
    } else {
      // Inicializar com credenciais reais
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        projectId,
      });
      console.log('✅ Firebase Admin inicializado com sucesso!');
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error);
    console.warn('⚠️  Continuando em modo de desenvolvimento...');
    
    // Fallback: inicializar sem credenciais
    admin.initializeApp({
      projectId: 'charbotflex-dev',
    });
  }
}

export const auth = getAuth();
export const db = getFirestore();

// Coleções do Firestore
export const collections = {
  users: 'users',
  conversations: 'conversations',
  messages: 'messages',
  botFlows: 'bot_flows',
  transfers: 'transfers',
  departments: 'departments',
  tags: 'tags',
  quickReplies: 'quick_replies',
  scheduledMessages: 'scheduled_messages',
  feedback: 'feedback',
  instagramConfig: 'instagram_config',
};
