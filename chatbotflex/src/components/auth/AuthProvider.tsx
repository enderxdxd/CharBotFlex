'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, fetchUserRole } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    
    console.log('🔐 AuthProvider - Inicializando listener único');
    
    // ÚNICO listener de autenticação - Firebase gerencia persistência
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const startTime = performance.now();
      console.log('🔐 Auth State Changed:', user?.email || 'deslogado');
      
      setUser(user);
      
      if (user) {
        // Buscar role do usuário em paralelo (não bloquear)
        fetchUserRole().catch(err => {
          console.error('Erro ao buscar role:', err);
        });
      }
      
      setLoading(false);
      
      const endTime = performance.now();
      console.log(`⚡ Auth verificado em ${(endTime - startTime).toFixed(0)}ms`);
    });

    return () => {
      console.log('🔓 AuthProvider - Removendo listener');
      unsubscribe();
    };
  }, [setUser, setLoading, fetchUserRole]);

  // Renderizar imediatamente - loading state é gerenciado pelo Zustand
  return <>{children}</>;
}
