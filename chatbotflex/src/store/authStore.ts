import { create } from 'zustand';
import { User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface AuthState {
  user: User | null;
  userRole: 'admin' | 'operator' | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setUserRole: (role: 'admin' | 'operator' | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Auth methods
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchUserRole: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
      user: null,
      userRole: null,
      loading: false,
      error: null,

      setUser: (user) => {
        console.log('📝 AuthStore - setUser:', user?.email || 'null');
        set({ user });
      },
      setUserRole: (userRole) => set({ userRole }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null });
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      set({ user: userCredential.user });
      
      // Buscar role do usuário
      await get().fetchUserRole();
      
    } catch (error: any) {
      let errorMessage = 'Erro ao fazer login';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'Usuário não encontrado';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Senha incorreta';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email inválido';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Muitas tentativas. Tente novamente mais tarde';
          break;
        default:
          errorMessage = 'Erro ao fazer login. Tente novamente';
      }
      
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      set({ user: null, userRole: null, error: null });
      console.log('✅ Logout realizado');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  },

  fetchUserRole: async () => {
    const { user, userRole } = get();
    
    if (!user) {
      set({ userRole: null });
      return;
    }

    // Se já tem role em cache, não buscar novamente
    if (userRole) {
      console.log('✅ Role em cache:', userRole);
      return;
    }

    try {
      console.log('🔍 Buscando role do usuário...');
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData.role || 'operator';
        set({ userRole: role });
        console.log('✅ Role obtido:', role);
      } else {
        // Se não existe no Firestore, assumir que é o primeiro admin
        set({ userRole: 'admin' });
        console.log('✅ Primeiro admin detectado');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar role:', error);
      set({ userRole: 'operator' });
    }
  },
}));
