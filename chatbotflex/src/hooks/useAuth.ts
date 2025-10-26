'use client';

import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Hook simplificado - usa AuthStore que é gerenciado pelo AuthProvider
 * NÃO cria listener duplicado
 */
export function useAuth() {
  const { user, loading, signOut: storeSignOut } = useAuthStore();
  const router = useRouter();

  const signOut = async () => {
    try {
      await storeSignOut();
      toast.success('Logout realizado com sucesso');
      router.push('/auth/login');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      toast.error('Erro ao fazer logout');
    }
  };

  const isAuthenticated = !!user;

  return {
    user,
    loading,
    isAuthenticated,
    signOut
  };
}
