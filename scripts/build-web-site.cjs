// @ts-nocheck -- Standalone Node build utility covered by focused runtime tests.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultOutDir = path.join(root, 'output', 'nexplay-web-site');
const manifestName = 'web-build-manifest.json';
const generatedBuildItems = new Set(['sw.js']);
const workerAssetToken = '__NEXPLAY_CRITICAL_ASSETS__';
const workerVersionToken = '__NEXPLAY_CACHE_VERSION__';

const criticalRootFiles = new Set([
  '404.html',
  'index.html',
  'manifest.iphone.webmanifest',
  'manifest.webmanifest',
  'NexPlay.html',
  'NexPlay.mobile.html',
  'nexplay-icon-brand.png',
]);

const requiredItems = Object.freeze([
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
  'vendor',
  'nexplay-icon-brand.png',
  'nexplay-next',
]);

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function assertSafeOutputDirectory(outDir) {
  const target = path.resolve(outDir);
  const outputRoot = path.join(root, 'output');
  const tempRoot = path.resolve(os.tmpdir());
  if (!isInside(outputRoot, target) && !isInside(tempRoot, target)) {
    throw new Error(`Web build output must be a child of ${outputRoot} or the system temporary directory.`);
  }
  return target;
}

function copyItem(outDir, relativePath) {
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

function replaceExactlyOnce(source, expected, replacement, label) {
  const first = source.indexOf(expected);
  if (first < 0 || source.indexOf(expected, first + expected.length) >= 0) {
    throw new Error(`Expected exactly one ${label} reference in the staged web source.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + expected.length);
}

function rewriteStagedDesktopWeb(outDir) {
  const desktopPath = path.join(outDir, 'index.html');
  let html = fs.readFileSync(desktopPath, 'utf8');
  const lineEnding = html.includes('\r\n') ? '\r\n' : '\n';
  html = replaceExactlyOnce(
    html,
    '</head>',
    [
      '    <link rel="manifest" href="./manifest.webmanifest">',
      '</head>',
    ].join(lineEnding),
    'desktop closing head'
  );
  html = replaceExactlyOnce(
    html,
    '</body>',
    [
      '    <script data-nexplay-web-worker>',
      '      (() => {',
      "        if (!('serviceWorker' in navigator)) return;",
      "        window.addEventListener('load', () => {",
      "          navigator.serviceWorker.register('./sw.js').catch((error) => {",
      "            console.warn('[NexPlay] Offline support could not start.', error);",
      '          });',
      '        }, { once: true });',
      '      })();',
      '    </script>',
      '</body>',
    ].join(lineEnding),
    'desktop closing body'
  );
  fs.writeFileSync(desktopPath, html, 'utf8');
}


function shouldPrecache(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (criticalRootFiles.has(normalized)) return true;
  const extension = path.extname(normalized).toLowerCase();
  if (normalized.startsWith('assets/')) {
    return ['.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(extension);
  }
  if (normalized.startsWith('components/')) return extension === '.html';
  if (normalized.startsWith('css/')) return extension === '.css';
  if (normalized.startsWith('js/')) return extension === '.js';
  if (normalized.startsWith('nexplay-next/')) return ['.cjs', '.js', '.mjs'].includes(extension);
  if (normalized.startsWith('vendor/')) {
    return ['.css', '.js', '.woff', '.woff2'].includes(extension);
  }
  return false;
}

function criticalAssetsForBuild(outDir) {
  const assets = listFiles(outDir)
    .map((absolute) => path.relative(outDir, absolute).split(path.sep).join('/'))
    .filter(shouldPrecache)
    .sort((left, right) => left.localeCompare(right))
    .map((relative) => `./${relative}`);
  return Object.freeze(['./', ...assets]);
}

function replaceTokenExactlyOnce(source, token, replacement) {
  const first = source.indexOf(token);
  if (first < 0 || source.indexOf(token, first + token.length) >= 0) {
    throw new Error(`Expected exactly one ${token} token in web/sw.js.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + token.length);
}

function stageWebServiceWorker(outDir) {
  const sourcePath = path.join(root, 'web', 'sw.js');
  if (!fs.existsSync(sourcePath)) throw new Error('Required web worker source is missing: web/sw.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const assets = criticalAssetsForBuild(outDir);
  const versionHash = crypto.createHash('sha256').update(source);
  for (const asset of assets) {
    versionHash.update(`\n${asset}\n`);
    if (asset !== './') versionHash.update(fs.readFileSync(path.join(outDir, asset.slice(2))));
  }
  const cacheVersion = versionHash.digest('hex').slice(0, 16);
  let staged = replaceTokenExactlyOnce(source, workerVersionToken, cacheVersion);
  staged = replaceTokenExactlyOnce(staged, workerAssetToken, JSON.stringify(assets, null, 2));
  fs.writeFileSync(path.join(outDir, 'sw.js'), staged, 'utf8');
  return { assets, cacheVersion };
}

function listFiles(directory) {
  const files = [];
  const visit = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.name !== '.DS_Store' && entry.name !== 'Thumbs.db')
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(directory);
  return files;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeBuildManifest(outDir) {
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = {};
  for (const absolute of listFiles(outDir)) {
    const relative = path.relative(outDir, absolute).split(path.sep).join('/');
    if (relative === manifestName) continue;
    files[relative] = sha256(absolute);
  }
  const manifest = {
    schemaVersion: 1,
    app: 'NexPlay Web',
    version: String(packageMetadata.version || ''),
    files,
  };
  fs.writeFileSync(path.join(outDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function buildWebSite(options = {}) {
  const outDir = assertSafeOutputDirectory(options.outDir || defaultOutDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const item of requiredItems) {
    if (!generatedBuildItems.has(item)) copyItem(outDir, item);
  }
  rewriteStagedDesktopWeb(outDir);
  stageWebServiceWorker(outDir);
  const manifest = writeBuildManifest(outDir);
  if (!options.quiet) {
    console.log(`NexPlay web site staged at ${outDir}`);
    console.log(`Verified manifest created for ${Object.keys(manifest.files).length} files.`);
  }
  return { outDir, manifest };
}

function readOutArgument(argv) {
  const index = argv.indexOf('--out');
  if (index < 0) return defaultOutDir;
  const value = argv[index + 1];
  if (!value) throw new Error('Missing value after --out.');
  return path.resolve(root, value);
}

module.exports = {
  buildWebSite,
  criticalAssetsForBuild,
  defaultOutDir,
  requiredItems,
  rewriteStagedDesktopWeb,
};

if (require.main === module) {
  const result = buildWebSite({ outDir: readOutArgument(process.argv.slice(2)) });
  const { verifyWebBuild } = require('./verify-web-build.cjs');
  verifyWebBuild({ outDir: result.outDir });
}
