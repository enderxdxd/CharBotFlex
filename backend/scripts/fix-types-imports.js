import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');

function fixTypesImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Fix ../types.js -> ../types/index.js
  if (content.includes("from '../types.js'")) {
    content = content.replace(/from ['"]\.\.\/types\.js['"]/g, "from '../types/index.js'");
    modified = true;
  }
  
  // Fix ../../types.js -> ../../types/index.js
  if (content.includes("from '../../types.js'")) {
    content = content.replace(/from ['"]\.\.\/\.\.\/types\.js['"]/g, "from '../../types/index.js'");
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
      filesFixed += fixTypesImports(filePath);
    }
  }
  
  return filesFixed;
}

console.log('🔧 Fixing types imports...\n');
const totalFixed = walkDirectory(srcDir);
console.log(`\n✨ Done! Fixed ${totalFixed} files.`);
