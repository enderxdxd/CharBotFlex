# 🔥 Como Configurar o Firebase

## ⚠️ IMPORTANTE

O backend está rodando em **modo de desenvolvimento** sem Firebase configurado.
Para usar todas as funcionalidades, você precisa configurar o Firebase.

---

## 📋 Passo a Passo

### 1️⃣ Criar Projeto no Firebase

1. Acesse: https://console.firebase.google.com/
2. Clique em **"Adicionar projeto"**
3. Dê um nome (ex: `CharBotFlex`)
4. Desabilite o Google Analytics (opcional)
5. Clique em **"Criar projeto"**

### 2️⃣ Ativar Firestore Database

1. No menu lateral, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Iniciar no modo de teste"** (para desenvolvimento)
4. Escolha a localização (ex: `southamerica-east1`)
5. Clique em **"Ativar"**

### 3️⃣ Ativar Authentication

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Vamos começar"**
3. Ative o provedor **"E-mail/senha"**
4. Salve

### 4️⃣ Gerar Credenciais do Admin SDK

1. Clique no ⚙️ (engrenagem) ao lado de **"Visão geral do projeto"**
2. Clique em **"Configurações do projeto"**
3. Vá para a aba **"Contas de serviço"**
4. Clique em **"Gerar nova chave privada"**
5. Confirme clicando em **"Gerar chave"**
6. Um arquivo JSON será baixado

### 5️⃣ Configurar o Backend

1. Abra o arquivo JSON que foi baixado
2. Copie as seguintes informações:
   - `project_id`
   - `client_email`
   - `private_key`

3. Abra o arquivo `backend/.env`

4. Cole as informações:

```env
FIREBASE_PROJECT_ID=seu-project-id-aqui
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"
```

**⚠️ IMPORTANTE:** 
- Mantenha as aspas duplas no `FIREBASE_PRIVATE_KEY`
- Mantenha os `\n` na chave privada

### 6️⃣ Configurar o Frontend

1. No Firebase Console, vá para **Configurações do projeto**
2. Role até **"Seus aplicativos"**
3. Clique no ícone **"</>"** (Web)
4. Registre o app (dê um nome)
5. Copie as configurações do Firebase

6. Abra `chatbotflex/.env.local`

7. Cole as configurações:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

### 7️⃣ Reiniciar os Servidores

1. Pare o backend (Ctrl+C)
2. Pare o frontend (Ctrl+C)
3. Inicie novamente:
   ```bash
   start.bat
   ```

---

## ✅ Verificar se Funcionou

### Backend:
Você deve ver no terminal:
```
✅ Firebase Admin inicializado com sucesso!
```

Em vez de:
```
⚠️  Firebase não configurado! Usando modo de desenvolvimento.
```

### Frontend:
- Você conseguirá fazer login
- Dados serão salvos no Firestore
- Autenticação funcionará corretamente

---

## 🔒 Segurança

### ⚠️ NUNCA COMPARTILHE:
- ❌ Arquivo JSON da conta de serviço
- ❌ Chave privada (`private_key`)
- ❌ Arquivo `.env` do backend
- ❌ Arquivo `.env.local` do frontend

### ✅ Adicione ao .gitignore:
```
.env
.env.local
*.json (credenciais)
```

---

## 🆘 Problemas Comuns

### 1. Erro: "Service account object must contain..."

**Solução:** Verifique se você copiou corretamente as credenciais do arquivo JSON

### 2. Erro: "Permission denied"

**Solução:** Configure as regras do Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. Backend roda mas não salva dados

**Solução:** Verifique se o Firestore está ativado no Firebase Console

---

## 💡 Modo de Desenvolvimento (Sem Firebase)

Se você não quiser configurar o Firebase agora:

✅ O backend vai rodar normalmente
✅ Você pode testar a interface
❌ Não vai salvar dados permanentemente
❌ Autenticação não funcionará

---

## 📚 Recursos

- [Firebase Console](https://console.firebase.google.com/)
- [Documentação Firebase Admin](https://firebase.google.com/docs/admin/setup)
- [Documentação Firestore](https://firebase.google.com/docs/firestore)

---

**Pronto! Agora seu CharBotFlex está conectado ao Firebase! 🎉**
