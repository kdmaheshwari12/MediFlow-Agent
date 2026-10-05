const fs = require('fs');
const path = require('path');

const targetDirs = ['app', 'features', 'services', 'components'];
const patterns = [/@demo\.clinic/, /MRN-100/, /services\/mock/];

let foundMocks = [];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          foundMocks.push(`${fullPath} matches ${pattern}`);
        }
      }
    }
  }
}

try {
  const rootDir = path.join(__dirname, '..');
  for (const d of targetDirs) {
    scanDir(path.join(rootDir, d));
  }

  if (foundMocks.length > 0) {
    console.error('ERROR: Found mock/demo data or imports in app code!');
    console.error(foundMocks.join('\n'));
    process.exit(1);
  }
  console.log('No mock/demo data found.');
} catch (e) {
  process.exit(0);
}
