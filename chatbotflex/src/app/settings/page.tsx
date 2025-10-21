'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { 
  Settings as SettingsIcon, 
  MessageSquare, 
  Shield, 
  Loader2, 
  Save,
  RotateCcw,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

interface SystemSettings {
  messages: {
    greetingDepartment: string;
    greetingUser: string;
    noExpectedResponse: string;
    fallback: string;
    queueWaiting: string;
    offlineMessage: string;
  };
  general: {
    companyName: string;
    supportEmail: string;
    supportPhone: string;
    workingHours: string;
  };
  bot: {
    enabled: boolean;
    defaultTimeout: number;
    maxRetries: number;
  };
}

export default function SettingsPage() {
  const { isAdmin, loading: permissionsLoading } = usePermissions();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings');
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMessages = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await api.put('/settings/messages', settings.messages);
      if (response.data.success) {
        toast.success('Mensagens salvas com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao salvar mensagens:', error);
      toast.error('Erro ao salvar mensagens');
    } finally {
      setSaving(false);
    }
  };

  const handleResetMessages = async () => {
    if (!confirm('Tem certeza que deseja restaurar as mensagens padrão?')) return;

    try {
      setSaving(true);
      const response = await api.post('/settings/messages/reset');
      if (response.data.success) {
        toast.success('Mensagens restauradas!');
        fetchSettings();
      }
    } catch (error) {
      console.error('Erro ao resetar mensagens:', error);
      toast.error('Erro ao resetar mensagens');
    } finally {
      setSaving(false);
    }
  };

  const updateMessage = (key: keyof SystemSettings['messages'], value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      messages: {
        ...settings.messages,
        [key]: value,
      },
    });
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

  if (!settings) {
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

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Configurações</h1>
                <p className="text-gray-600">Personalize as mensagens do sistema</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={handleResetMessages}
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restaurar Padrão
                </button>
                <button
                  onClick={handleSaveMessages}
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>

          {/* Messages Section */}
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center">
                <MessageSquare className="h-5 w-5 text-indigo-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Mensagens Personalizadas</h2>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Greeting Department */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem de Saudação (Departamento)
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Enviada quando o bot direciona o atendimento para um departamento
                </p>
                <textarea
                  value={settings.messages.greetingDepartment}
                  onChange={(e) => updateMessage('greetingDepartment', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: Olá! Você foi direcionado para o departamento de {departmentName}..."
                />
                <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>Variáveis disponíveis: <code className="bg-gray-100 px-1 py-0.5 rounded">{'{departmentName}'}</code></span>
                </div>
              </div>

              {/* Greeting User */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem de Saudação (Usuário)
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Enviada quando o bot direciona o atendimento para um usuário específico
                </p>
                <textarea
                  value={settings.messages.greetingUser}
                  onChange={(e) => updateMessage('greetingUser', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: Olá! Você está sendo atendido por {userName}..."
                />
                <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>Variáveis disponíveis: <code className="bg-gray-100 px-1 py-0.5 rounded">{'{userName}'}</code></span>
                </div>
              </div>

              {/* No Expected Response */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem de Resposta Não Esperada
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Enviada quando a resposta do cliente não corresponde aos valores esperados
                </p>
                <textarea
                  value={settings.messages.noExpectedResponse}
                  onChange={(e) => updateMessage('noExpectedResponse', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: Desculpe, não entendi sua resposta..."
                />
              </div>

              {/* Fallback */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem de Fallback
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Mensagem padrão quando o bot não consegue entender
                </p>
                <textarea
                  value={settings.messages.fallback}
                  onChange={(e) => updateMessage('fallback', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: Desculpe, não consegui entender..."
                />
              </div>

              {/* Queue Waiting */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem de Espera na Fila
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Enviada quando o cliente está aguardando na fila de atendimento
                </p>
                <textarea
                  value={settings.messages.queueWaiting}
                  onChange={(e) => updateMessage('queueWaiting', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: Você está na posição {position} da fila..."
                />
                <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>Variáveis disponíveis: <code className="bg-gray-100 px-1 py-0.5 rounded">{'{position}'}</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">{'{estimatedTime}'}</code></span>
                </div>
              </div>

              {/* Offline Message */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Mensagem Fora do Horário
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Enviada quando ninguém está disponível para atendimento
                </p>
                <textarea
                  value={settings.messages.offlineMessage}
                  onChange={(e) => updateMessage('offlineMessage', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ex: No momento estamos fora do horário de atendimento..."
                />
                <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>Variáveis disponíveis: <code className="bg-gray-100 px-1 py-0.5 rounded">{'{workingHours}'}</code></span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Dica sobre variáveis</p>
                <p>
                  Use variáveis entre chaves como <code className="bg-blue-100 px-1 py-0.5 rounded">{'{userName}'}</code> para personalizar as mensagens.
                  O sistema substituirá automaticamente pelas informações corretas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
