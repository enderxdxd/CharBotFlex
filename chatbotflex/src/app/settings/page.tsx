'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { Settings as SettingsIcon, Smartphone, Bot, Bell, Shield, Loader2, CheckCircle, XCircle, QrCode } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { isAdmin, loading: permissionsLoading } = usePermissions();
  const [botStatus, setBotStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBotStatus();
  }, []);

  const fetchBotStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bot/status');
      if (response.data.success) {
        setBotStatus(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao buscar status do bot:', error);
    } finally {
      setLoading(false);
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
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Configurações</h1>
            <p className="text-gray-600">Gerencie as configurações do sistema</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* WhatsApp Status */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center">
                  <Smartphone className="h-5 w-5 text-indigo-600 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">WhatsApp</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Baileys Status */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full ${botStatus?.baileys?.connected ? 'bg-green-100' : 'bg-red-100'}`}>
                      {botStatus?.baileys?.connected ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">Baileys (Gratuito)</p>
                      <p className="text-sm text-gray-500">
                        {botStatus?.baileys?.connected ? 'Conectado' : 'Desconectado'}
                      </p>
                    </div>
                  </div>
                  
                  {!botStatus?.baileys?.connected && botStatus?.baileys?.qrCode && (
                    <button
                      onClick={() => {
                        const win = window.open('', 'QR Code', 'width=400,height=400');
                        win?.document.write(`<img src="${botStatus.baileys.qrCode}" style="width:100%"/>`);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 flex items-center gap-2"
                    >
                      <QrCode className="h-4 w-4" />
                      Ver QR Code
                    </button>
                  )}
                </div>

                {/* Official API Status */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full ${botStatus?.officialAPI?.configured ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      {botStatus?.officialAPI?.configured ? (
                        <CheckCircle className="h-5 w-5 text-blue-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">API Oficial (Pago)</p>
                      <p className="text-sm text-gray-500">
                        {botStatus?.officialAPI?.configured ? 'Configurado' : 'Não configurado'}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={fetchBotStatus}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
                >
                  Atualizar Status
                </button>
              </div>
            </div>

            {/* Bot Configuration */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center">
                  <Bot className="h-5 w-5 text-indigo-600 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">Bot</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tempo de resposta automática (segundos)
                  </label>
                  <input
                    type="number"
                    defaultValue={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Máximo de tentativas do bot
                  </label>
                  <input
                    type="number"
                    defaultValue={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Transferência automática</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <button
                  onClick={() => toast.success('Configurações salvas!')}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
                >
                  Salvar Configurações
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center">
                  <Bell className="h-5 w-5 text-indigo-600 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">Notificações</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Novas mensagens</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Conversas aguardando</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Transferências</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <button
                  onClick={() => toast.success('Preferências salvas!')}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium mt-4"
                >
                  Salvar Preferências
                </button>
              </div>
            </div>

            {/* System Info */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center">
                  <SettingsIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">Sistema</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Versão</span>
                  <span className="font-medium text-gray-900">1.0.0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Ambiente</span>
                  <span className="font-medium text-gray-900">Produção</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Backend</span>
                  <span className="font-medium text-green-600">Online</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">WebSocket</span>
                  <span className="font-medium text-green-600">Conectado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
