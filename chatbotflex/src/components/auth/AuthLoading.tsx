'use client';

import { useAuthStore } from '@/store/authStore';
import { useEffect, useState } from 'react';

/**
 * Componente de loading otimizado
 * Mostra loading apenas nos primeiros 2 segundos
 * Depois disso, assume que não há sessão e libera a UI
 */
export function AuthLoading({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuthStore();
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    // Timeout de segurança: após 2s, liberar UI mesmo se ainda loading
    const timeout = setTimeout(() => {
      if (initialLoad) {
        console.log('⏱️ Timeout de auth atingido - liberando UI');
        setInitialLoad(false);
      }
    }, 2000);

    // Se auth resolver antes do timeout, liberar imediatamente
    if (!loading) {
      setInitialLoad(false);
      clearTimeout(timeout);
    }

    return () => clearTimeout(timeout);
  }, [loading, initialLoad]);

  // Mostrar loading apenas no carregamento inicial E se ainda não passou o timeout
  if (initialLoad && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4"></div>
          <p className="text-gray-600 font-medium">Verificando autenticação...</p>
          <p className="text-gray-400 text-sm mt-2">Aguarde um momento</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
