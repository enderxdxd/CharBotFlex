'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/auth/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 bg-indigo-600 rounded-lg flex items-center justify-center mb-6">
          <span className="text-white text-2xl font-bold">CB</span>
        </div>
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">CharBotFlex</h1>
        <p className="text-gray-600">Carregando sistema...</p>
      </div>
    </div>
  );
}
