'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checkingPasswordReset, setCheckingPasswordReset] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!loading && !user) {
        router.push('/auth/login');
        return;
      }

      if (user && pathname !== '/auth/reset-password') {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.requirePasswordReset === true) {
              router.push('/auth/reset-password');
              return;
            }
          }
        } catch (error) {
          console.error('Erro ao verificar status de reset:', error);
        }
      }
      
      setCheckingPasswordReset(false);
    };

    checkAuth();
  }, [user, loading, router, pathname]);

  if (loading || checkingPasswordReset) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
