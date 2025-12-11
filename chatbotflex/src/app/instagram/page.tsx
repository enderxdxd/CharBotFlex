'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import MainLayout from '@/components/layout/MainLayout';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Instagram,
  Settings,
  CheckCircle,
  XCircle,
  RefreshCw,
  Link2,
  Unlink,
  MessageCircle,
  Users,
  Activity,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface InstagramConfig {
  id?: string;
  pageId: string;
  instagramAccountId: string;
  pageName?: string;
  instagramUsername?: string;
  isActive: boolean;
  webhookVerifyToken: string;
  hasAccessToken: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface InstagramStats {
  totalConversations: number;
  activeConversations: number;
  messagesLast24h: number;
}

export default function InstagramPage() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<InstagramConfig | null>(null);
  const [stats, setStats] = useState<InstagramStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Form fields
  const [pageId, setPageId] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pageName, setPageName] = useState('');
  const [instagramUsername, setInstagramUsername] = useState('');

  useEffect(() => {
    fetchConfig();
    fetchStats();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.get('/instagram/config');
      if (response.data.success && response.data.data) {
        const data = response.data.data;
        setConfig(data);
        setPageId(data.pageId || '');
        setInstagramAccountId(data.instagramAccountId || '');
        setPageName(data.pageName || '');
        setInstagramUsername(data.instagramUsername || '');
      }
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/instagram/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!pageId || !instagramAccountId) {
      toast.error('Page ID e Instagram Account ID são obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('/instagram/config', {
        pageId,
        instagramAccountId,
        accessToken: accessToken || undefined,
        pageName,
        instagramUsername,
        isActive: config?.isActive ?? false,
      });

      if (response.data.success) {
        toast.success('Configuração salva com sucesso!');
        setConfig(response.data.data);
        setAccessToken(''); // Limpar token após salvar
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!config) return;

    try {
      const response = await api.post('/instagram/toggle', {
        isActive: !config.isActive,
      });

      if (response.data.success) {
        setConfig({ ...config, isActive: !config.isActive });
        toast.success(config.isActive ? 'Instagram desativado' : 'Instagram ativado');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao alterar status');
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const response = await api.get('/instagram/validate');
      if (response.data.success && response.data.data.valid) {
        toast.success('Token válido! Conexão funcionando.');
      } else {
        toast.error(response.data.data.error || 'Token inválido');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao validar');
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      'Tem certeza que deseja desconectar o Instagram? Todas as configurações serão removidas.'
    );
    if (!confirmed) return;

    try {
      const response = await api.post('/instagram/disconnect');
      if (response.data.success) {
        setConfig(null);
        setPageId('');
        setInstagramAccountId('');
        setAccessToken('');
        setPageName('');
        setInstagramUsername('');
        toast.success('Instagram desconectado');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao desconectar');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin.replace('3000', '3001')}/api/instagram/webhook`
    : '';

  if (loading) {
    return (
      <ProtectedRoute>
        <MainLayout>
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                <Instagram className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Instagram</h1>
                <p className="text-gray-600">Configure a integração com Instagram Direct</p>
              </div>
            </div>
            {config && (
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  config.isActive 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {config.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          {stats && config?.isActive && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <MessageCircle className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total de Conversas</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalConversations}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Conversas Ativas</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.activeConversations}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Activity className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Mensagens (24h)</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.messagesLast24h}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Como configurar:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Crie um App no <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">Meta for Developers</a></li>
                  <li>Adicione o produto &quot;Instagram&quot; ao seu App</li>
                  <li>Conecte sua página do Facebook com conta Instagram Business</li>
                  <li>Gere um Access Token com permissões de mensagens</li>
                  <li>Configure o Webhook com a URL abaixo</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Configuração do Webhook
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL (Callback URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookUrl, 'URL')}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {config?.webhookVerifyToken && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Verify Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showToken ? 'text' : 'password'}
                      readOnly
                      value={config.webhookVerifyToken}
                      className="flex-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(config.webhookVerifyToken, 'Token')}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Configure o webhook no Meta for Developers com os campos: <code className="bg-yellow-100 px-1 rounded">messages</code>, <code className="bg-yellow-100 px-1 rounded">messaging_postbacks</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração da Conta
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Page ID *
                </label>
                <input
                  type="text"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="ID da página do Facebook"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instagram Account ID *
                </label>
                <input
                  type="text"
                  value={instagramAccountId}
                  onChange={(e) => setInstagramAccountId(e.target.value)}
                  placeholder="ID da conta Instagram Business"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da Página
                </label>
                <input
                  type="text"
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="Nome da página (opcional)"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username do Instagram
                </label>
                <input
                  type="text"
                  value={instagramUsername}
                  onChange={(e) => setInstagramUsername(e.target.value)}
                  placeholder="@username (opcional)"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token {config?.hasAccessToken && <span className="text-green-600">(Configurado)</span>}
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={config?.hasAccessToken ? '••••••••••••••••' : 'Cole o Access Token aqui'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Deixe em branco para manter o token atual
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Salvar Configuração
              </button>

              {config && (
                <>
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {validating ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                    Validar Token
                  </button>

                  <button
                    onClick={handleToggleActive}
                    className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      config.isActive
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {config.isActive ? (
                      <>
                        <XCircle className="h-4 w-4" />
                        Desativar
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Ativar
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDisconnect}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2"
                  >
                    <Unlink className="h-4 w-4" />
                    Desconectar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Documentation Link */}
          <div className="text-center">
            <a
              href="https://developers.facebook.com/docs/instagram-api/guides/messaging"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Documentação da API do Instagram
            </a>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
