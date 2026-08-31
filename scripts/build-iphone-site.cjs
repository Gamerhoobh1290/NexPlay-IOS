const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'nexplay-iphone-site');

const requiredItems = [
  'index.html',
  'NexPlay.mobile.html',
  'NexPlay.html',
  '404.html',
  'manifest.webmanifest',
  'manifest.iphone.webmanifest',
  'sw.js',
  'css',
  'js',
  'components',
  'assets',
  'nexplay-icon-brand.png',
  'nexplay-next',
  // Both shells load fonts, Lucide, and Chart.js from here.
  'vendor',
];

function copyItem(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(outDir, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Required publish asset is missing: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (item) => {
      const base = path.basename(item);
      return base !== '.DS_Store' && base !== 'Thumbs.db';
    },
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const item of requiredItems) {
  copyItem(item);
}

console.log(`NexPlay iPhone site staged at ${outDir}`);
