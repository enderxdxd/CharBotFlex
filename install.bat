@echo off
echo 🚀 Instalando CharBotFlex...
echo.

echo 📦 Instalando dependências do backend...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Erro ao instalar dependências do backend
    pause
    exit /b 1
)

echo.
echo 📦 Instalando dependências do frontend...
cd ..\chatbotflex
call npm install
if %errorlevel% neq 0 (
    echo ❌ Erro ao instalar dependências do frontend
    pause
    exit /b 1
)

echo.
echo ✅ Instalação concluída!
echo.
echo 📋 Próximos passos:
echo 1. Configure o arquivo backend\.env (copie de .env.example)
echo 2. Configure o arquivo chatbotflex\.env.local (copie de .env.example)
echo 3. Execute: npm run dev:all (na pasta raiz)
echo.
pause
