import fs from 'fs';
import path from 'path';

function listDir(dir: string, prefix = '') {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      console.log(`${prefix}[DIR] ${file}`);
      listDir(fullPath, prefix + '  ');
    } else {
      console.log(`${prefix}${file}`);
    }
  }
}

console.log('Listing d:\\Z360 Task files:');
listDir('d:\\Z360 Task');
