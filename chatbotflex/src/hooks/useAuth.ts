'use client';

import { useState, useEffect } from 'react';
import { 
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Forçar refresh do token para garantir que está válido
        try {
          await user.getIdToken(true);
        } catch (error) {
          console.error('Erro ao renovar token:', error);
        }
      }
      setUser(user);
      setLoading(false);
    });

    // Renovar token a cada 50 minutos (tokens expiram em 1 hora)
    const tokenRefreshInterval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await currentUser.getIdToken(true);
          console.log('🔄 Token renovado automaticamente');
        } catch (error) {
          console.error('Erro ao renovar token:', error);
        }
      }
    }, 50 * 60 * 1000); // 50 minutos

    return () => {
      unsubscribe();
      clearInterval(tokenRefreshInterval);
    };
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
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
