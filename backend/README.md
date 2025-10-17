# CharBotFlex Backend

Backend do sistema CharBotFlex - Sistema de atendimento WhatsApp com bot inteligente.

## 🚀 Instalação

### Pré-requisitos
- Node.js 18+ 
- npm ou yarn
- Conta Firebase com Firestore habilitado

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=seu-projeto-firebase
FIREBASE_CLIENT_EMAIL=sua-service-account@projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA\n-----END PRIVATE KEY-----\n"

# WhatsApp (escolha um dos providers)
WHATSAPP_PROVIDER=baileys  # ou 'official'

# Para Baileys (gratuito)
BAILEYS_SESSION_PATH=./baileys_sessions

# Para API Oficial (pago)
WHATSAPP_API_TOKEN=seu-token-da-api
WHATSAPP_PHONE_ID=seu-phone-number-id
```

### 3. Executar o servidor

#### Desenvolvimento
```bash
npm run dev
```

#### Produção
```bash
npm run build
npm start
```

## 📁 Estrutura do Projeto

```
src/
├── config/          # Configurações (Firebase, etc)
├── controllers/     # Controllers da API
├── middleware/      # Middlewares (auth, etc)
├── models/          # Modelos de dados
├── routes/          # Rotas da API
├── services/        # Serviços de negócio
│   ├── bot/         # Engine do bot
│   └── whatsapp/    # Integração WhatsApp
├── socket/          # Handlers do Socket.IO
├── types/           # Tipos TypeScript
├── utils/           # Utilitários
└── server.ts        # Servidor principal
```

## 🔧 Configuração do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com)
2. Crie um novo projeto ou use um existente
3. Ative o Firestore Database
4. Vá em "Configurações do projeto" → "Contas de serviço"
5. Gere uma nova chave privada
6. Baixe o arquivo JSON e extraia as informações para o `.env`

## 📱 Configuração do WhatsApp

### Opção 1: Baileys (Gratuito)
- Não requer configuração adicional
- QR Code será gerado no primeiro uso
- Escaneie com seu WhatsApp

### Opção 2: API Oficial (Pago)
1. Acesse [Meta for Developers](https://developers.facebook.com)
2. Crie um app WhatsApp Business
3. Configure webhook e tokens
4. Adicione as credenciais no `.env`

## 🌐 Endpoints da API

### Autenticação
Todas as rotas (exceto `/health`) requerem token JWT do Firebase.

### Principais Endpoints

```
GET  /health                    # Status do servidor
GET  /api/bot/status           # Status do WhatsApp
GET  /api/bot/flows            # Listar fluxos do bot
POST /api/bot/flows            # Criar fluxo
GET  /api/users                # Listar usuários
POST /api/users                # Criar usuário (admin only)
```

## 🔌 WebSocket Events

### Cliente → Servidor
- `message:send` - Enviar mensagem
- `conversation:join` - Entrar em conversa
- `user:status` - Atualizar status

### Servidor → Cliente  
- `message:new` - Nova mensagem
- `conversation:waiting` - Conversa aguardando
- `user:status` - Status de usuário atualizado

## 🐛 Troubleshooting

### Erro de conexão Firebase
- Verifique se as credenciais estão corretas
- Confirme se o Firestore está habilitado
- Teste a conectividade de rede

### WhatsApp não conecta
- Para Baileys: Delete a pasta `baileys_sessions` e tente novamente
- Para API Oficial: Verifique tokens e webhook

### Erros de TypeScript
```bash
npm run build
```

## 📝 Scripts Disponíveis

```bash
npm run dev      # Desenvolvimento com hot reload
npm run build    # Build para produção  
npm start        # Executar versão de produção
npm run lint     # Verificar código
```

## 🔒 Segurança

- Tokens JWT validados em todas as rotas
- Permissões baseadas em roles (admin/operator)
- Validação de entrada em todos os endpoints
- Rate limiting (recomendado para produção)

## 📊 Monitoramento

Logs são salvos no console com diferentes níveis:
- `INFO` - Operações normais
- `WARN` - Avisos importantes  
- `ERROR` - Erros que precisam atenção

## 🚀 Deploy

### Docker (Recomendado)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
```

### Variáveis de Ambiente para Produção
```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://seu-frontend.com
```
