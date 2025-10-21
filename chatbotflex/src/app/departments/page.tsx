'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { 
  Building2, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Shield,
  Loader2,
  UserPlus,
  Settings,
  TrendingUp,
  Shuffle,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

type DistributionStrategy = 'balanced' | 'sequential' | 'random';

interface Department {
  id: string;
  name: string;
  description: string;
  distributionStrategy: DistributionStrategy;
  isActive: boolean;
  userIds: string[];
  maxChatsPerUser: number;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  uid: string;
  name: string;
  email: string;
  departmentId?: string;
}

export default function DepartmentsPage() {
  const { isAdmin, loading: permissionsLoading } = usePermissions();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    distributionStrategy: 'balanced' as DistributionStrategy,
    maxChatsPerUser: 5,
  });

  useEffect(() => {
    fetchDepartments();
    fetchUsers();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar departamentos:', error);
      toast.error('Erro ao carregar departamentos');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      if (response.data.success) {
        setUsers(response.data.data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post('/departments', formData);
      if (response.data.success) {
        toast.success('Departamento criado com sucesso!');
        fetchDepartments();
        setShowCreateModal(false);
        setFormData({
          name: '',
          description: '',
          distributionStrategy: 'balanced',
          maxChatsPerUser: 5,
        });
      }
    } catch (error) {
      console.error('Erro ao criar departamento:', error);
      toast.error('Erro ao criar departamento');
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDepartment) return;

    try {
      const response = await api.put(`/departments/${selectedDepartment.id}`, formData);
      if (response.data.success) {
        toast.success('Departamento atualizado!');
        fetchDepartments();
        setShowEditModal(false);
        setSelectedDepartment(null);
      }
    } catch (error) {
      console.error('Erro ao atualizar departamento:', error);
      toast.error('Erro ao atualizar departamento');
    }
  };

  const handleDeleteDepartment = async () => {
    if (!selectedDepartment) return;

    try {
      setDeleting(true);
      const response = await api.delete(`/departments/${selectedDepartment.id}`);
      if (response.data.success) {
        toast.success('Departamento deletado!');
        fetchDepartments();
        setShowDeleteConfirm(false);
        setSelectedDepartment(null);
      }
    } catch (error) {
      console.error('Erro ao deletar departamento:', error);
      toast.error('Erro ao deletar departamento');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddUserToDepartment = async (userId: string) => {
    if (!selectedDepartment) return;

    try {
      const response = await api.post(`/departments/${selectedDepartment.id}/users`, { userId });
      if (response.data.success) {
        toast.success('Usuário adicionado ao departamento!');
        fetchDepartments();
        fetchUsers();
      }
    } catch (error) {
      console.error('Erro ao adicionar usuário:', error);
      toast.error('Erro ao adicionar usuário');
    }
  };

  const handleRemoveUserFromDepartment = async (userId: string) => {
    if (!selectedDepartment) return;

    try {
      const response = await api.delete(`/departments/${selectedDepartment.id}/users/${userId}`);
      if (response.data.success) {
        toast.success('Usuário removido do departamento!');
        fetchDepartments();
        fetchUsers();
      }
    } catch (error) {
      console.error('Erro ao remover usuário:', error);
      toast.error('Erro ao remover usuário');
    }
  };

  const getStrategyIcon = (strategy: DistributionStrategy) => {
    switch (strategy) {
      case 'balanced':
        return <TrendingUp className="h-4 w-4" />;
      case 'sequential':
        return <ArrowRight className="h-4 w-4" />;
      case 'random':
        return <Shuffle className="h-4 w-4" />;
    }
  };

  const getStrategyLabel = (strategy: DistributionStrategy) => {
    switch (strategy) {
      case 'balanced':
        return 'Equilibrada';
      case 'sequential':
        return 'Sequencial';
      case 'random':
        return 'Aleatória';
    }
  };

  const getStrategyDescription = (strategy: DistributionStrategy) => {
    switch (strategy) {
      case 'balanced':
        return 'Distribui para o usuário com menos conversas';
      case 'sequential':
        return 'Distribui para o primeiro usuário disponível';
      case 'random':
        return 'Distribui aleatoriamente entre usuários disponíveis';
    }
  };

  if (permissionsLoading || loading) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Acesso Negado</h1>
              <p className="text-gray-600">Apenas administradores podem acessar esta página.</p>
            </div>
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Departamentos</h1>
                <p className="text-gray-600">Gerencie departamentos e distribua conversas</p>
              </div>
              
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Departamento
              </button>
            </div>
          </div>

          {/* Departments Grid */}
          {departments.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum departamento criado</h3>
              <p className="text-gray-500 mb-6">Crie seu primeiro departamento para organizar sua equipe</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Departamento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((dept) => (
                <div key={dept.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className="p-2 rounded-lg bg-indigo-100">
                          <Building2 className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="ml-3">
                          <h3 className="text-lg font-semibold text-gray-900">{dept.name}</h3>
                          <p className="text-sm text-gray-600">{dept.description || 'Sem descrição'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Estratégia:</span>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {getStrategyIcon(dept.distributionStrategy)}
                          <span className="text-xs font-medium">{getStrategyLabel(dept.distributionStrategy)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Usuários:</span>
                        <span className="font-medium text-gray-900">{dept.userIds.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Max chats/usuário:</span>
                        <span className="font-medium text-gray-900">{dept.maxChatsPerUser}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {dept.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setSelectedDepartment(dept);
                          setShowUsersModal(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Usuários
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDepartment(dept);
                          setFormData({
                            name: dept.name,
                            description: dept.description,
                            distributionStrategy: dept.distributionStrategy,
                            maxChatsPerUser: dept.maxChatsPerUser,
                          });
                          setShowEditModal(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDepartment(dept);
                          setShowDeleteConfirm(true);
                        }}
                        className="px-3 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || showEditModal) && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <form onSubmit={showCreateModal ? handleCreateDepartment : handleUpdateDepartment}>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {showCreateModal ? 'Criar Departamento' : 'Editar Departamento'}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estratégia de Distribuição</label>
                      <select
                        value={formData.distributionStrategy}
                        onChange={(e) => setFormData({ ...formData, distributionStrategy: e.target.value as DistributionStrategy })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="balanced">Equilibrada</option>
                        <option value="sequential">Sequencial</option>
                        <option value="random">Aleatória</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        {getStrategyDescription(formData.distributionStrategy)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Máximo de chats por usuário</label>
                      <input
                        type="number"
                        value={formData.maxChatsPerUser}
                        onChange={(e) => setFormData({ ...formData, maxChatsPerUser: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        min="1"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-6">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      {showCreateModal ? 'Criar' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setShowEditModal(false);
                        setSelectedDepartment(null);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users Modal */}
        {showUsersModal && selectedDepartment && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Usuários do Departamento: {selectedDepartment.name}
                </h3>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Usuários no departamento</h4>
                    {selectedDepartment.userIds.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum usuário neste departamento</p>
                    ) : (
                      <div className="space-y-2">
                        {users.filter(u => selectedDepartment.userIds.includes(u.uid)).map(user => (
                          <div key={user.uid} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <div>
                              <p className="font-medium text-gray-900">{user.name}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveUserFromDepartment(user.uid)}
                              className="px-3 py-1 text-sm text-red-700 bg-red-100 rounded-md hover:bg-red-200"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Adicionar usuários</h4>
                    <div className="space-y-2">
                      {users.filter(u => !selectedDepartment.userIds.includes(u.uid)).map(user => (
                        <div key={user.uid} className="flex items-center justify-between p-3 bg-white border rounded-md">
                          <div>
                            <p className="font-medium text-gray-900">{user.name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                          <button
                            onClick={() => handleAddUserToDepartment(user.uid)}
                            className="px-3 py-1 text-sm text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200"
                          >
                            Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowUsersModal(false);
                    setSelectedDepartment(null);
                  }}
                  className="w-full mt-6 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false);
            setSelectedDepartment(null);
          }}
          onConfirm={handleDeleteDepartment}
          title="Deletar Departamento"
          message={`Tem certeza que deseja deletar o departamento "${selectedDepartment?.name}"? Esta ação não pode ser desfeita.`}
          confirmText="Deletar"
          cancelText="Cancelar"
          type="danger"
          loading={deleting}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
