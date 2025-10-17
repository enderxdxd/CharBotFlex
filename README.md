# CharBotFlex

Sistema completo de atendimento via WhatsApp com chatbot inteligente e interface web moderna.

## 🚀 Tecnologias

### Frontend (Next.js 14)
- **Next.js 14** com App Router
- **TypeScript** para tipagem estática
- **Tailwind CSS** para estilização
- **Firebase** para autenticação
- **Socket.io** para comunicação real-time
- **Zustand** para gerenciamento de estado
- **React Query** para cache de dados
- **React Hook Form + Zod** para formulários
- **Lucide React** para ícones
- **Sonner** para notificações

### Backend (Node.js)
- **Express.js** para API REST
- **Socket.io** para WebSocket
- **Firebase Admin** para autenticação
- **Redis** para cache e sessões
- **Baileys** para WhatsApp (não oficial)
- **WhatsApp Business API** (oficial)
- **TypeScript** para tipagem

## 📁 Estrutura do Projeto

```
CharBotFlex/
├── backend/                 # API Backend
│   ├── src/
│   │   ├── config/         # Configurações (Firebase, Redis)
│   │   ├── controllers/    # Controllers da API
│   │   ├── services/       # Serviços (WhatsApp, Bot)
│   │   ├── models/         # Modelos de dados
│   │   ├── middleware/     # Middlewares
│   │   ├── routes/         # Rotas da API
│   │   ├── socket/         # Socket.io handlers
│   │   ├── types/          # Tipos TypeScript
│   │   └── utils/          # Utilitários
│   └── package.json
│
└── chatbotflex/            # Frontend Next.js
    ├── src/
    │   ├── app/            # Páginas (App Router)
    │   │   ├── auth/       # Autenticação
    │   │   ├── dashboard/  # Dashboard
    │   │   ├── chats/      # Gerenciamento de chats
    │   │   ├── users/      # Gerenciamento de usuários
    │   │   ├── settings/   # Configurações
    │   │   └── bot-flows/  # Editor de fluxos do bot
    │   ├── components/     # Componentes React
    │   │   ├── auth/       # Componentes de autenticação
    │   │   ├── chat/       # Componentes de chat
    │   │   ├── dashboard/  # Componentes do dashboard
    │   │   ├── users/      # Componentes de usuários
    │   │   ├── settings/   # Componentes de configurações
    │   │   ├── ui/         # Componentes UI base
    │   │   └── layout/     # Componentes de layout
    │   ├── lib/            # Utilitários (Firebase, Socket, API)
    │   ├── hooks/          # Hooks customizados
    │   ├── store/          # Estado global (Zustand)
    │   └── types/          # Tipos TypeScript
    └── package.json
```

## ⚙️ Configuração

### 1. Clone o repositório
```bash
git clone <repository-url>
cd CharBotFlex
```

### 2. Configure o Backend
```bash
cd backend
npm install
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
# Firebase
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# WhatsApp
WHATSAPP_PROVIDER=baileys # ou 'official'
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Servidor
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 3. Configure o Frontend
```bash
cd ../chatbotflex
npm install
cp .env.example .env.local
```

Edite o arquivo `.env.local`:
```env
# Firebase (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 4. Configure o Firebase
1. Crie um projeto no [Firebase Console](https://console.firebase.google.com)
2. Ative a autenticação por email/senha
3. Configure o Firestore Database
4. Obtenha as credenciais do projeto

### 5. Execute o projeto

#### Backend
```bash
cd backend
npm run dev
```

#### Frontend
```bash
cd chatbotflex
npm run dev
```

## 🔧 Funcionalidades

### ✅ Implementado
- [x] Autenticação com Firebase
- [x] Interface de login/registro
- [x] Dashboard básico
- [x] Estrutura de componentes
- [x] Proteção de rotas
- [x] Configuração do backend
- [x] Estrutura de serviços WhatsApp
- [x] Engine de fluxos do bot

### 🚧 Em Desenvolvimento
- [ ] Interface de chat em tempo real
- [ ] Gerenciamento de usuários
- [ ] Editor visual de fluxos do bot
- [ ] Integração completa com WhatsApp
- [ ] Sistema de transferência de atendimento
- [ ] Relatórios e analytics
- [ ] Configurações avançadas

## 📱 Uso

1. Acesse `http://localhost:3000`
2. Faça login ou crie uma conta
3. Acesse o dashboard para ver as estatísticas
4. Configure os fluxos do bot
5. Gerencie os atendimentos em tempo real

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.
