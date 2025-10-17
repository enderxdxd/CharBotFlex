# 🚀 Como Iniciar o CharBotFlex

## ⚠️ IMPORTANTE: Você precisa iniciar BACKEND + FRONTEND

### 📋 Pré-requisitos

1. ✅ Node.js instalado
2. ✅ Dependências instaladas (execute `install.bat` se ainda não fez)
3. ✅ Arquivos `.env` configurados

---

## 🎯 Opção 1: Iniciar Tudo de Uma Vez (RECOMENDADO)

### Execute o arquivo `start.bat`:

```bash
start.bat
```

Isso vai abrir **2 janelas**:
- 🔵 **Backend** (porta 3001)
- 🟢 **Frontend** (porta 3000)

**Aguarde até ver:**
- Backend: `Server running on port 3001`
- Frontend: `Ready in X.Xs`

---

## 🎯 Opção 2: Iniciar Manualmente

### 1️⃣ Iniciar o Backend (OBRIGATÓRIO!)

Abra um terminal e execute:

```bash
cd backend
npm run dev
```

**Aguarde até ver:** `Server running on port 3001`

### 2️⃣ Iniciar o Frontend

Abra OUTRO terminal e execute:

```bash
cd chatbotflex
npm run dev
```

**Aguarde até ver:** `Ready in X.Xs`

---

## 🔍 Como Verificar se Está Funcionando

### ✅ Backend Rodando:
- Acesse: http://localhost:3001/health
- Deve retornar: `{"status":"ok"}`

### ✅ Frontend Rodando:
- Acesse: http://localhost:3000
- Deve abrir a página de login

---

## ❌ Problemas Comuns

### 1. Erro: `ERR_CONNECTION_REFUSED` ou `Network Error`

**Causa:** Backend não está rodando!

**Solução:**
1. Abra um terminal
2. Execute: `cd backend && npm run dev`
3. Aguarde iniciar
4. Recarregue o frontend

### 2. Erro: `Port 3001 is already in use`

**Causa:** Já tem algo rodando na porta 3001

**Solução:**
1. Feche o processo que está usando a porta
2. Ou mude a porta no `backend/.env`:
   ```
   PORT=3002
   ```

### 3. Erro: `Port 3000 is already in use`

**Causa:** Já tem algo rodando na porta 3000

**Solução:**
1. Feche o processo que está usando a porta
2. Ou o Next.js vai sugerir outra porta automaticamente

---

## 📱 URLs Importantes

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health
- **API Docs:** http://localhost:3001/api-docs (se configurado)

---

## 🎨 Fluxo de Trabalho

1. ✅ Inicie o **backend** primeiro
2. ✅ Depois inicie o **frontend**
3. ✅ Acesse http://localhost:3000
4. ✅ Faça login
5. ✅ Crie seus fluxos de bot!

---

## 💡 Dicas

- **Mantenha as 2 janelas abertas** enquanto trabalha
- Se algo der errado, **reinicie ambos os servidores**
- Verifique os logs nos terminais para ver erros
- Use `Ctrl+C` para parar os servidores

---

## 🆘 Ainda com Problemas?

1. Verifique se as dependências estão instaladas:
   ```bash
   cd backend && npm install
   cd ../chatbotflex && npm install
   ```

2. Verifique os arquivos `.env`:
   - `backend/.env` deve existir
   - `chatbotflex/.env.local` deve existir

3. Reinicie tudo:
   - Feche todos os terminais
   - Execute `start.bat` novamente

---

**Pronto! Agora você pode usar o CharBotFlex! 🎉**
