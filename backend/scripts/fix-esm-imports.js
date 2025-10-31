import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');

// Regex para encontrar imports relativos sem extensão .js
const importRegex = /from\s+['"](\.\.[\/\\].*?|\.\/.*?)(?<!\.js)['"]/g;

function fixImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  const newContent = content.replace(importRegex, (match, importPath) => {
    // Não adicionar .js se já termina com .js ou .json
    if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
      return match;
    }
    
    modified = true;
    return match.replace(importPath, `${importPath}.js`);
  });
  
  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✅ Fixed: ${path.relative(srcDir, filePath)}`);
    return 1;
  }
  
  return 0;
}

function walkDirectory(dir) {
  let filesFixed = 0;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      filesFixed += walkDirectory(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      filesFixed += fixImportsInFile(filePath);
    }
  }
  
  return filesFixed;
}

console.log('🔧 Fixing ESM imports in TypeScript files...\n');
const totalFixed = walkDirectory(srcDir);
console.log(`\n✨ Done! Fixed ${totalFixed} files.`);
