import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - adicionar token de autenticação
api.interceptors.request.use(
  async (config) => {
    try {
      let user = auth.currentUser;
      
      // Se não tem usuário, aguardar até 1s para Firebase carregar sessão
      if (!user) {
        console.log('⏳ Aguardando Firebase carregar sessão...');
        
        // Tentar até 5 vezes com delay de 200ms
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          user = auth.currentUser;
          if (user) {
            console.log('✅ Sessão carregada após', (i + 1) * 200, 'ms');
            break;
          }
        }
      }
      
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        console.warn('⚠️ Nenhum usuário autenticado após 1s');
      }
    } catch (error) {
      console.error('❌ Erro ao obter token:', error);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - tratar erros
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response) {
      // Erro com resposta do servidor
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Token inválido ou expirado
          console.warn('⚠️ 401 - Token expirado ou inválido');
          
          // Dar até 2 tentativas antes de forçar logout
          const retryCount = originalRequest._retryCount || 0;
          
          if (retryCount < 2) {
            originalRequest._retryCount = retryCount + 1;
            
            try {
              const user = auth.currentUser;
              if (user) {
                console.log(`🔄 Tentativa ${retryCount + 1}/2 de renovar token...`);
                
                // Forçar renovação do token
                const newToken = await user.getIdToken(true);
                console.log('✅ Token renovado com sucesso');
                
                // Atualizar header com novo token
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                
                // Tentar requisição novamente
                return api(originalRequest);
              } else {
                console.warn('⚠️ Usuário não está logado');
              }
            } catch (refreshError) {
              console.error(`❌ Erro na tentativa ${retryCount + 1}:`, refreshError);
              
              // Se ainda tem tentativas, não fazer logout
              if (retryCount < 1) {
                // Aguardar 1s antes de tentar novamente
                await new Promise(resolve => setTimeout(resolve, 1000));
                return api(originalRequest);
              }
            }
          }
          
          // Após 2 tentativas falhadas, fazer logout suave
          console.error('❌ Falha após 2 tentativas - fazendo logout');
          
          // Não forçar logout imediatamente - deixar usuário decidir
          if (typeof window !== 'undefined') {
            // Mostrar toast ao invés de redirecionar imediatamente
            const toast = (await import('sonner')).toast;
            toast.error('Sessão expirada. Por favor, faça login novamente.', {
              duration: 5000,
              action: {
                label: 'Login',
                onClick: () => {
                  auth.signOut();
                  window.location.href = '/auth/login';
                }
              }
            });
          }
          break;

        case 403:
          console.error('Acesso negado:', data.error);
          break;

        case 404:
          console.error('Recurso não encontrado:', data.error);
          break;

        case 500:
          console.error('Erro interno do servidor:', data.error);
          break;

        default:
          console.error(`Erro ${status}:`, data.error);
      }
    } else if (error.request) {
      // Requisição feita mas sem resposta
      console.error('Sem resposta do servidor');
    } else {
      // Erro ao configurar requisição
      console.error('Erro na requisição:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;