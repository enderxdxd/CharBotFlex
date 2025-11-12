'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { 
  Smartphone, 
  QrCode, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Plus,
  Trash2,
  Shield,
  Bot
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

interface WhatsAppConnection {
  id: string;
  phoneNumber: string;
  name: string;
  status: 'connected' | 'disconnected' | 'qr_pending';
  qrCode?: string;
  lastSeen?: Date;
  botFlowId?: string;
  botFlowName?: string;
}

interface BotFlow {
  id: string;
  name: string;
  isActive: boolean;
}

export default function WhatsAppPage() {
  const { isAdmin, loading: permissionsLoading } = usePermissions();
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [botFlows, setBotFlows] = useState<BotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    fetchConnections();
    fetchQrCode();
    fetchBotFlows();

    // Escutar eventos do Socket.IO para erros do WhatsApp
    if (typeof window !== 'undefined') {
      const socket = (window as any).socket;
      if (socket) {
        socket.on('whatsapp:error', (data: { code: string; message: string }) => {
          console.error('Erro do WhatsApp:', data);
          
          if (data.code === 'MAX_DEVICES') {
            toast.error(data.message, {
              duration: 10000,
              description: 'Vá em: WhatsApp > Configurações > Aparelhos conectados > Desconecte um dispositivo',
            });
            setQrError(true);
            setQrLoading(false);
            setQrCode(null);
          } else {
            toast.error(data.message, { duration: 7000 });
          }
        });

        return () => {
          socket.off('whatsapp:error');
        };
      }
    }
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp/connections');
      if (response.data.success) {
        setConnections(response.data.data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar conexões:', error);
      toast.error('Erro ao carregar conexões do WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  const fetchQrCode = async () => {
    try {
      const response = await api.get('/bot/status');
      if (response.data.success && response.data.data.baileys.qrCode) {
        setQrCode(response.data.data.baileys.qrCode);
      }
    } catch (error) {
      console.error('Erro ao buscar QR Code:', error);
    }
  };

  const fetchBotFlows = async () => {
    try {
      const response = await api.get('/bot/flows');
      if (response.data.success) {
        setBotFlows(response.data.data || []);
      }
    } catch (error) {
      console.error('Erro ao buscar bot flows:', error);
    }
  };

  const handleLinkBotFlow = async (connectionId: string, botFlowId: string) => {
    try {
      const response = await api.post(`/whatsapp/link-flow/${connectionId}`, { botFlowId });
      if (response.data.success) {
        toast.success('Bot Flow vinculado com sucesso!');
        fetchConnections();
        setShowFlowModal(false);
      }
    } catch (error) {
      console.error('Erro ao vincular bot flow:', error);
      toast.error('Erro ao vincular bot flow');
    }
  };

  const handleGenerateQr = async () => {
    try {
      setShowQrModal(true);
      setQrCode(null);
      setQrError(false);
      setQrLoading(true);
      toast.info('Conectando ao WhatsApp...', { duration: 3000 });
      
      const response = await api.post('/whatsapp/generate-qr');
      if (response.data.success) {
        // Verificar se já está conectado
        if (response.data.data.connected) {
          toast.success('WhatsApp já está conectado!');
          setShowQrModal(false);
          fetchConnections();
          return;
        }
        
        setQrCode(response.data.data.qrCode);
        setQrError(false);
        toast.success('QR Code gerado! Escaneie com seu WhatsApp.', { duration: 5000 });
      }
    } catch (error: any) {
      console.error('Erro ao gerar QR Code:', error);
      
      // Mostrar mensagem de erro específica se disponível
      const errorMessage = error.response?.data?.error || 'Não foi possível conectar ao WhatsApp. Tente novamente.';
      toast.error(errorMessage, { 
        duration: 7000,
        action: {
          label: 'Tentar Novamente',
          onClick: () => handleGenerateQr()
        }
      });
      
      setQrError(true);
      setQrCode(null);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm('Tem certeza que deseja desconectar este número?')) return;

    try {
      const response = await api.post(`/whatsapp/disconnect/${connectionId}`);
      if (response.data.success) {
        toast.success('WhatsApp desconectado com sucesso');
        fetchConnections();
      }
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      toast.error('Erro ao desconectar WhatsApp');
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Conexões WhatsApp</h1>
                <p className="text-gray-600">Gerencie os números conectados ao bot</p>
              </div>
              
              <button
                onClick={handleGenerateQr}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Conectar Novo Número
              </button>
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Smartphone className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Status da Conexão</h3>
                  <p className="text-sm text-gray-600">
                    {connections.filter(c => c.status === 'connected').length} número(s) conectado(s)
                  </p>
                </div>
              </div>
              <button
                onClick={fetchConnections}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Connections List */}
          {connections.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Smartphone className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum número conectado</h3>
              <p className="text-gray-500 mb-6">Conecte seu primeiro número do WhatsApp para começar</p>
              <button
                onClick={handleGenerateQr}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Conectar WhatsApp
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {connections.map((connection) => (
                <div key={connection.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${
                          connection.status === 'connected' ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          <Smartphone className={`h-5 w-5 ${
                            connection.status === 'connected' ? 'text-green-600' : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="ml-3">
                          <h3 className="text-lg font-semibold text-gray-900">{connection.name}</h3>
                          <p className="text-sm text-gray-600">{connection.phoneNumber}</p>
                        </div>
                      </div>
                      {connection.status === 'connected' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" />
                      )}
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          connection.status === 'connected'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {connection.status === 'connected' ? 'Conectado' : 'Desconectado'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Bot Flow:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          connection.botFlowName
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {connection.botFlowName || 'Não vinculado'}
                        </span>
                      </div>
                      {connection.lastSeen && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Última atividade:</span>
                          <span className="text-gray-900">
                            {new Date(connection.lastSeen).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setSelectedConnection(connection.id);
                          setShowFlowModal(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                      >
                        <Bot className="h-4 w-4 mr-1" />
                        Vincular Bot
                      </button>
                      <button
                        onClick={() => handleDisconnect(connection.id)}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Desconectar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR Code Modal */}
        {showQrModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Conectar WhatsApp</h3>
                  <button
                    onClick={() => setShowQrModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                {qrLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">Gerando QR Code...</p>
                    <p className="text-xs text-gray-500">Isso pode levar alguns segundos</p>
                  </div>
                ) : qrError ? (
                  <div className="text-center py-8">
                    <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-900 font-medium mb-2">Erro ao gerar QR Code</p>
                    <p className="text-sm text-gray-600 mb-6">
                      Verifique sua conexão e os logs do servidor
                    </p>
                    <button
                      onClick={handleGenerateQr}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Tentar Novamente
                    </button>
                  </div>
                ) : qrCode ? (
                  <div className="text-center">
                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4">
                      <img 
                        src={qrCode} 
                        alt="QR Code WhatsApp" 
                        className="w-full h-auto"
                      />
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      1. Abra o WhatsApp no seu celular
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      2. Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong>
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      3. Toque em <strong>Aparelhos conectados</strong> e depois em <strong>Conectar um aparelho</strong>
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      4. Aponte seu celular para esta tela para escanear o código
                    </p>
                    <button
                      onClick={handleGenerateQr}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Gerar Novo QR Code
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Bot Flow Selection Modal */}
        {showFlowModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Vincular Bot Flow</h3>
                  <button
                    onClick={() => setShowFlowModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  Selecione qual bot flow será usado neste número do WhatsApp:
                </p>

                {botFlows.length === 0 ? (
                  <div className="text-center py-8">
                    <Bot className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-600 mb-4">Nenhum bot flow disponível</p>
                    <p className="text-sm text-gray-500">Crie um bot flow primeiro na página Bot Flows</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {botFlows.map((flow) => (
                      <button
                        key={flow.id}
                        onClick={() => selectedConnection && handleLinkBotFlow(selectedConnection, flow.id)}
                        className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex items-center">
                          <div className={`p-2 rounded-lg ${
                            flow.isActive ? 'bg-green-100' : 'bg-gray-100'
                          }`}>
                            <Bot className={`h-5 w-5 ${
                              flow.isActive ? 'text-green-600' : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="ml-3 text-left">
                            <p className="text-sm font-medium text-gray-900">{flow.name}</p>
                            <p className="text-xs text-gray-500">
                              {flow.isActive ? 'Ativo' : 'Inativo'}
                            </p>
                          </div>
                        </div>
                        <div className="text-indigo-600">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
