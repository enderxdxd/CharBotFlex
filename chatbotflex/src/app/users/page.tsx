'use client';

import { useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { Plus, Users, Shield, UserCheck, Loader2 } from 'lucide-react';

export default function UsersPage() {
  const { canCreateUsers, isAdmin, loading: permissionsLoading } = usePermissions();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'operator' as 'admin' | 'operator'
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canCreateUsers) {
      toast.error('Você não tem permissão para criar usuários');
      return;
    }

    if (!formData.name || !formData.email || !formData.password) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsCreating(true);

    try {
      // Criar usuário no Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      
      // Atualizar perfil
      await updateProfile(userCredential.user, {
        displayName: formData.name
      });

      // Salvar dados do usuário no Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isOnline: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: auth.currentUser?.uid
      });

      toast.success(`Usuário ${formData.name} criado com sucesso!`);
      
      // Limpar formulário
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'operator'
      });
      setShowCreateForm(false);
      
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      
      let errorMessage = 'Erro ao criar usuário';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Este email já está em uso';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Email inválido';
          break;
        case 'auth/weak-password':
          errorMessage = 'A senha é muito fraca';
          break;
        default:
          errorMessage = 'Erro ao criar usuário. Tente novamente';
      }
      
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  if (permissionsLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!canCreateUsers) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Acesso Negado</h1>
            <p className="text-gray-600">Você não tem permissão para acessar esta página.</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Gerenciar Usuários</h1>
                <p className="text-gray-600">Criar e gerenciar contas de usuários do sistema</p>
              </div>
              
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Usuário
              </button>
            </div>
          </div>

          {showCreateForm && (
            <div className="bg-white shadow rounded-lg mb-8">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Criar Novo Usuário</h3>
              </div>
              
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nome do usuário"
                      disabled={isCreating}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="email@exemplo.com"
                      disabled={isCreating}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Mínimo 6 caracteres"
                      disabled={isCreating}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Função
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value as 'admin' | 'operator'})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      disabled={isCreating}
                    >
                      <option value="operator">Operador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    disabled={isCreating}
                  >
                    Cancelar
                  </button>
                  
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Criar Usuário
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Lista de Usuários</h3>
            </div>
            
            <div className="p-6">
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500">Lista de usuários será implementada aqui</p>
                <p className="text-sm text-gray-400 mt-2">
                  Funcionalidade de listagem em desenvolvimento
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
