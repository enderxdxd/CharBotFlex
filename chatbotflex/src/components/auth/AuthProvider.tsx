'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { initAuthPersistence, hasAuthData } from '@/lib/authPersistence';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    setMounted(true);
    
    // Inicializar persistência customizada
    initAuthPersistence();
    
    // Verificar se há dados salvos
    if (hasAuthData()) {
      console.log('📦 Dados de autenticação encontrados no localStorage');
    }
    
    // Escutar mudanças de autenticação
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔐 Auth Provider - Usuário:', user?.email || 'deslogado');
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  // Não renderizar nada até estar montado no cliente
  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}
