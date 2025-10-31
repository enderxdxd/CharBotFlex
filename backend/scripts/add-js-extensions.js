#!/usr/bin/env node

/**
 * Script para adicionar extensões .js aos imports relativos
 * Necessário para ES Modules
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

function addJsExtensions(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      addJsExtensions(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Adicionar .js aos imports relativos
      content = content.replace(
        /from\s+['"](\.\.[\/\\][^'"]+)['"]/g,
        (match, p1) => {
          if (!p1.endsWith('.js')) {
            return `from '${p1}.js'`;
          }
          return match;
        }
      );
      
      content = content.replace(
        /from\s+['"](\.[\/\\][^'"]+)['"]/g,
        (match, p1) => {
          if (!p1.endsWith('.js')) {
            return `from '${p1}.js'`;
          }
          return match;
        }
      );

      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

if (fs.existsSync(distDir)) {
  console.log('🔧 Adicionando extensões .js aos imports...');
  addJsExtensions(distDir);
  console.log('✅ Extensões .js adicionadas!');
} else {
  console.log('⚠️  Pasta dist não encontrada. Execute npm run build primeiro.');
}
