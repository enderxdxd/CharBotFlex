@echo off
echo 🚀 Iniciando CharBotFlex...
echo.

echo 🔍 Verificando se as dependências estão instaladas...

if not exist "backend\node_modules" (
    echo ❌ Dependências do backend não encontradas
    echo Execute install.bat primeiro
    pause
    exit /b 1
)

if not exist "chatbotflex\node_modules" (
    echo ❌ Dependências do frontend não encontradas
    echo Execute install.bat primeiro
    pause
    exit /b 1
)

echo ✅ Dependências encontradas
echo.

echo 🔧 Verificando arquivos de configuração...

if not exist "backend\.env" (
    echo ⚠️  Arquivo backend\.env não encontrado
    echo Copiando de .env.example...
    copy "backend\.env.example" "backend\.env"
    echo ⚠️  Configure o arquivo backend\.env antes de continuar
)

if not exist "chatbotflex\.env.local" (
    echo ⚠️  Arquivo chatbotflex\.env.local não encontrado
    echo Copiando de .env.example...
    copy "chatbotflex\.env.example" "chatbotflex\.env.local"
    echo ⚠️  Configure o arquivo chatbotflex\.env.local antes de continuar
)

echo.
echo 🚀 Iniciando serviços...
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo API Health: http://localhost:3001/health
echo.

start "CharBotFlex Backend" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak > nul
start "CharBotFlex Frontend" cmd /k "cd chatbotflex && npm run dev"

echo ✅ Serviços iniciados!
echo Pressione qualquer tecla para fechar...
pause > nul
