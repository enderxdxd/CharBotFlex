'use client';

import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

const TOKEN_KEY = 'firebase_auth_token';
const USER_KEY = 'firebase_auth_user';

/**
 * Salvar token e dados do usuário no localStorage
 */
export const saveAuthData = async (user: User) => {
  try {
    const token = await user.getIdToken();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    }));
    console.log('💾 Dados de autenticação salvos');
  } catch (error) {
    console.error('Erro ao salvar dados de autenticação:', error);
  }
};

/**
 * Limpar dados de autenticação do localStorage
 */
export const clearAuthData = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  console.log('🗑️ Dados de autenticação removidos');
};

/**
 * Verificar se há dados de autenticação salvos
 */
export const hasAuthData = (): boolean => {
  return !!localStorage.getItem(TOKEN_KEY) && !!localStorage.getItem(USER_KEY);
};

/**
 * Obter token salvo
 */
export const getSavedToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Inicializar persistência de autenticação
 */
export const initAuthPersistence = () => {
  if (typeof window === 'undefined') return;

  // Escutar mudanças de autenticação
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Usuário logado - salvar dados
      await saveAuthData(user);
    } else {
      // Usuário deslogado - limpar dados
      clearAuthData();
    }
  });

  console.log('✅ Persistência de autenticação inicializada');
};
