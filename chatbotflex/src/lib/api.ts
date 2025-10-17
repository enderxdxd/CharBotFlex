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
      const user = auth.currentUser;
      
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Erro ao obter token:', error);
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
    if (error.response) {
      // Erro com resposta do servidor
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Token inválido ou expirado
          console.error('Não autorizado - redirecionando para login');
          
          // Fazer logout
          await auth.signOut();
          
          // Redirecionar para login
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
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