# 🔗 Guia de Integração CharBotFlex

Este guia explica como integrar completamente o frontend e backend do CharBotFlex.

## 📋 Pré-requisitos

- Node.js 18+
- Firebase Project configurado
- WhatsApp Business (para Baileys) ou WhatsApp Business API (oficial)

## 🚀 Configuração Completa

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

**Configure o `.env` do backend:**
```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# Firebase Admin SDK
FIREBASE_PROJECT_ID=seu-projeto-firebase
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"

# WhatsApp
WHATSAPP_PROVIDER=baileys
BAILEYS_SESSION_PATH=./baileys_sessions
```

### 2. Frontend Setup

```bash
cd chatbotflex
npm install
cp .env.example .env.local
```

**Configure o `.env.local` do frontend:**
```env
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=sua-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto-firebase
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc123

# API Backend
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

### 3. Firebase Configuration

#### 3.1 Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Conversations collection
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null;
    }
    
    // Messages collection
    match /messages/{messageId} {
      allow read, write: if request.auth != null;
    }
    
    // Bot flows collection
    match /bot_flows/{flowId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Transfers collection
    match /transfers/{transferId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

#### 3.2 Authentication Rules
- Ative Email/Password no Firebase Authentication
- Desative "Create new accounts" (apenas admins criam usuários)

## 🔄 Executando o Sistema

### 1. Iniciar Backend
```bash
cd backend
npm run dev
```

### 2. Iniciar Frontend
```bash
cd chatbotflex
npm run dev
```

### 3. Verificar Integração
- Backend: http://localhost:3001/health
- Frontend: http://localhost:3000
- API: http://localhost:3001/api/bot/status

## 🎯 Fluxo de Autenticação

1. **Login** → Frontend autentica via Firebase Auth
2. **Token JWT** → Enviado automaticamente para backend
3. **Verificação** → Backend valida token e busca dados do usuário
4. **Permissões** → Sistema verifica roles (admin/operator)

## 📱 Integração WhatsApp

### Baileys (Gratuito)
1. Execute o backend
2. QR Code aparecerá no console
3. Escaneie com WhatsApp Business
4. Conexão estabelecida automaticamente

### API Oficial (Pago)
1. Configure webhook no Meta for Developers
2. Aponte para: `http://seu-dominio:3001/api/webhook/whatsapp`
3. Configure tokens no `.env`

## 🔌 WebSocket Integration

O frontend se conecta automaticamente ao WebSocket do backend:

```typescript
// Frontend conecta automaticamente
const socket = useSocket(); // Hook já configurado

// Eventos principais
socket.on('message:new', handleNewMessage);
socket.on('conversation:waiting', handleWaitingConversation);
socket.on('user:status', handleUserStatus);
```

## 🛠️ Desenvolvimento

### Estrutura de Pastas Integrada
```
CharBotFlex/
├── backend/              # API Node.js + Socket.IO
│   ├── src/
│   │   ├── controllers/  # Lógica de negócio
│   │   ├── services/     # WhatsApp + Bot Engine
│   │   ├── socket/       # WebSocket handlers
│   │   └── routes/       # Endpoints da API
│   └── package.json
├── chatbotflex/          # Frontend Next.js
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # Componentes React
│   │   ├── hooks/        # Custom hooks
│   │   ├── store/        # Zustand stores
│   │   └── lib/          # Utilitários
│   └── package.json
└── INTEGRATION_GUIDE.md
```

### Comandos Úteis

```bash
# Instalar tudo
npm run install:all

# Executar ambos em desenvolvimento
npm run dev:all

# Build para produção
npm run build:all

# Limpar caches
npm run clean:all
```

## 🔍 Debugging

### Logs do Backend
```bash
# Logs detalhados
DEBUG=* npm run dev

# Apenas logs da aplicação
npm run dev
```

### DevTools do Frontend
- Redux DevTools para Zustand
- React DevTools
- Network tab para API calls

### Problemas Comuns

#### 1. CORS Error
```javascript
// backend/src/server.ts
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

#### 2. Firebase Auth Error
- Verifique se as chaves estão corretas
- Confirme se o domínio está autorizado

#### 3. WhatsApp não conecta
- Delete `baileys_sessions` e tente novamente
- Verifique se o WhatsApp Web está deslogado

## 📊 Monitoramento

### Health Checks
```bash
# Backend
curl http://localhost:3001/health

# Frontend
curl http://localhost:3000/api/health
```

### Logs Importantes
- `✅ Serviços inicializados` - Backend OK
- `📱 QR Code gerado` - WhatsApp pronto
- `🔗 Socket conectado` - WebSocket OK

## 🚀 Deploy

### Backend (Railway/Heroku)
```bash
# Build
npm run build

# Variáveis de ambiente
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://seu-frontend.vercel.app
```

### Frontend (Vercel/Netlify)
```bash
# Build
npm run build

# Variáveis de ambiente
NEXT_PUBLIC_API_URL=https://seu-backend.railway.app/api
NEXT_PUBLIC_WS_URL=https://seu-backend.railway.app
```

## ✅ Checklist de Integração

- [ ] Firebase projeto criado e configurado
- [ ] Backend rodando na porta 3001
- [ ] Frontend rodando na porta 3000
- [ ] Firestore rules aplicadas
- [ ] WhatsApp conectado (QR Code escaneado)
- [ ] Primeiro admin criado
- [ ] WebSocket funcionando
- [ ] API endpoints respondendo
- [ ] Autenticação funcionando
- [ ] Permissões de roles ativas

## 🆘 Suporte

Se encontrar problemas:

1. Verifique os logs do backend e frontend
2. Confirme se todas as variáveis de ambiente estão corretas
3. Teste os endpoints individualmente
4. Verifique a conectividade Firebase
5. Confirme se o WhatsApp está conectado

O sistema está totalmente integrado e pronto para uso! 🎉
