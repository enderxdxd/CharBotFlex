import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');

function fixRequireStatements(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Pattern 1: const { X } = require('./path');
  const pattern1 = /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g;
  if (pattern1.test(content)) {
    content = content.replace(
      /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
      (match, imports, modulePath) => {
        // Add .js extension if it's a relative path and doesn't have one
        if (modulePath.startsWith('.') && !modulePath.endsWith('.js')) {
          modulePath += '.js';
        }
        return `import { ${imports.trim()} } from '${modulePath}';`;
      }
    );
    modified = true;
  }
  
  // Pattern 2: const X = require('path');
  const pattern2 = /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g;
  if (pattern2.test(content)) {
    content = content.replace(
      /const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g,
      (match, varName, modulePath) => {
        // Add .js extension if it's a relative path and doesn't have one
        if (modulePath.startsWith('.') && !modulePath.endsWith('.js')) {
          modulePath += '.js';
        }
        return `import ${varName} from '${modulePath}';`;
      }
    );
    modified = true;
  }
  
  // Remove comment lines about inline imports
  if (content.includes('Importação inline para resolver problema')) {
    content = content.replace(/\/\/ Importação inline para resolver problema.*\n/g, '');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
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
      filesFixed += fixRequireStatements(filePath);
    }
  }
  
  return filesFixed;
}

console.log('🔧 Fixing require() statements...\n');
const totalFixed = walkDirectory(srcDir);
console.log(`\n✨ Done! Fixed ${totalFixed} files.`);
