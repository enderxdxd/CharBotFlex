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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
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
