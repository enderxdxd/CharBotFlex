import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence,
  indexedDBLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Inicializar apenas se ainda não foi inicializado
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Inicializar Auth
export const auth = getAuth(app);
export const db = getFirestore(app);

// SOLUÇÃO DEFINITIVA: Usar IndexedDB (mais confiável que localStorage)
if (typeof window !== 'undefined') {
  // Tentar IndexedDB primeiro, fallback para localStorage
  setPersistence(auth, indexedDBLocalPersistence)
    .then(() => {
      console.log('✅ Persistência configurada com IndexedDB');
    })
    .catch((error) => {
      console.warn('⚠️ IndexedDB falhou, usando localStorage:', error);
      // Fallback para localStorage
      return setPersistence(auth, browserLocalPersistence);
    })
    .then(() => {
      console.log('✅ Firebase Auth pronto');
    })
    .catch((error) => {
      console.error('❌ ERRO CRÍTICO ao configurar persistência:', error);
    });
}

export default app;
