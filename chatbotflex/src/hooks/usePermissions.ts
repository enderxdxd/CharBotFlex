'use client';

import { useAuth } from './useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useState, useEffect } from 'react';

export function usePermissions() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<'admin' | 'operator' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserRole() {
      if (!user) {
        setUserRole(null);
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role || 'operator');
        } else {
          // Se não existe no Firestore, assumir que é o primeiro admin
          setUserRole('admin');
        }
      } catch (error) {
        console.error('Erro ao buscar role do usuário:', error);
        setUserRole('operator');
      } finally {
        setLoading(false);
      }
    }

    fetchUserRole();
  }, [user]);

  const isAdmin = userRole === 'admin';
  const isOperator = userRole === 'operator';
  const canCreateUsers = isAdmin;
  const canManageSettings = isAdmin;
  const canViewReports = isAdmin;

  return {
    userRole,
    loading,
    isAdmin,
    isOperator,
    canCreateUsers,
    canManageSettings,
    canViewReports
  };
}
