'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { Bot, Plus, Edit, Trash2, Power, PowerOff, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface BotFlow {
  id: string;
  name: string;
  isActive: boolean;
  trigger: {
    type: string;
    value: string;
  };
  nodes: any[];
  createdAt: Date;
  updatedAt: Date;
}

export default function BotFlowsPage() {
  const router = useRouter();
  const { isAdmin, loading: permissionsLoading } = usePermissions();
  const [flows, setFlows] = useState<BotFlow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bot/flows');
      if (response.data.success) {
        setFlows(response.data.data || []);
      }
    } catch (error: any) {
      console.error('Erro ao buscar fluxos:', error);
      // Se for 404 ou erro de rota, apenas mostra lista vazia
      if (error?.response?.status === 404 || error?.code === 'ERR_NETWORK') {
        setFlows([]);
      } else {
        toast.error('Erro ao carregar fluxos do bot');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFlow = async (flowId: string) => {
    try {
      const response = await api.patch(`/bot/flows/${flowId}/toggle`);
      if (response.data.success) {
        toast.success(response.data.message);
        fetchFlows();
      }
    } catch (error) {
      console.error('Erro ao alternar fluxo:', error);
      toast.error('Erro ao alternar status do fluxo');
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm('Tem certeza que deseja deletar este fluxo?')) return;

    try {
      const response = await api.delete(`/bot/flows/${flowId}`);
      if (response.data.success) {
        toast.success('Fluxo deletado com sucesso');
        fetchFlows();
      }
    } catch (error) {
      console.error('Erro ao deletar fluxo:', error);
      toast.error('Erro ao deletar fluxo');
    }
  };

  if (permissionsLoading || loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Acesso Negado</h1>
            <p className="text-gray-600">Apenas administradores podem acessar esta página.</p>
          </div>
        </div>
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Fluxos do Bot</h1>
                <p className="text-gray-600">Gerencie os fluxos conversacionais do bot</p>
              </div>
              
              <button
                onClick={() => router.push('/bot-flows/new')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Fluxo
              </button>
            </div>
          </div>

          {/* Flows Grid */}
          {flows.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Bot className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum fluxo criado</h3>
              <p className="text-gray-500 mb-6">Comece criando seu primeiro fluxo conversacional</p>
              <button
                onClick={() => router.push('/bot-flows/new')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Fluxo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200">
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${flow.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                          <Bot className={`h-5 w-5 ${flow.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="ml-3">
                          <h3 className="text-lg font-semibold text-gray-900">{flow.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {flow.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <span className="font-medium mr-2">Gatilho:</span>
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">{flow.trigger.value}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <span className="font-medium mr-2">Nós:</span>
                        <span>{flow.nodes.length} etapas</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => handleToggleFlow(flow.id)}
                        className={`flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${
                          flow.isActive
                            ? 'text-red-700 bg-red-100 hover:bg-red-200'
                            : 'text-green-700 bg-green-100 hover:bg-green-200'
                        }`}
                      >
                        {flow.isActive ? (
                          <>
                            <PowerOff className="h-4 w-4 mr-1" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4 mr-1" />
                            Ativar
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => router.push(`/bot-flows/${flow.id}`)}
                        className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={() => handleDeleteFlow(flow.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md"
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
      </MainLayout>
    </ProtectedRoute>
  );
}
