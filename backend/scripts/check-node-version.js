#!/usr/bin/env node

/**
 * Script para verificar se a versão do Node.js é compatível
 * Baileys requer Node.js >= 18 para WebCrypto
 */

const requiredVersion = 18;
const currentVersion = parseInt(process.version.slice(1).split('.')[0]);

console.log('🔍 Verificando versão do Node.js...');
console.log(`   Versão atual: ${process.version}`);
console.log(`   Versão mínima: v${requiredVersion}.0.0`);

if (currentVersion < requiredVersion) {
  console.error('\n❌ ERRO: Versão do Node.js incompatível!');
  console.error(`   O Baileys requer Node.js >= ${requiredVersion} para WebCrypto.`);
  console.error('\n📝 Soluções:');
  console.error('   1. Atualize o Node.js: https://nodejs.org/');
  console.error('   2. Use nvm: nvm install 20 && nvm use 20');
  console.error('   3. No Railway: Configure RAILWAY_NODE_VERSION=20');
  process.exit(1);
}

// Verificar se crypto está disponível
try {
  const crypto = require('crypto');
  if (crypto.webcrypto) {
    console.log('✅ WebCrypto disponível');
  } else {
    console.log('⚠️  WebCrypto não encontrado, mas crypto nativo está disponível');
  }
} catch (error) {
  console.error('❌ ERRO: Módulo crypto não disponível!');
  process.exit(1);
}

console.log('✅ Ambiente compatível com Baileys!\n');
