// @ts-nocheck -- Standalone Node verifier covered by focused runtime tests.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { defaultOutDir, requiredItems } = require('./build-web-site.cjs');

const manifestName = 'web-build-manifest.json';
const remoteUiHosts = Object.freeze([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
]);

function listFiles(directory) {
  const files = [];
  const visit = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
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

function isRemoteOrSpecial(reference) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference);
}

function resolveLocalReference(outDir, sourceFile, rawReference) {
  const reference = String(rawReference || '').trim();
  if (!reference || reference.includes('${') || reference.includes('<%') || isRemoteOrSpecial(reference)) return null;
  const clean = reference.split('#')[0].split('?')[0];
  if (!clean) return null;
  return clean.startsWith('/')
    ? path.resolve(outDir, clean.replace(/^\/+/, ''))
    : path.resolve(path.dirname(sourceFile), clean);
}

function collectHtmlReferences(source) {
  const references = [];
  const attributePattern = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(source))) references.push(match[1]);
  return references;
}

function collectCssReferences(source) {
  const references = [];
  const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match;
  while ((match = urlPattern.exec(source))) references.push(match[1]);
  return references;
}

function collectModuleReferences(source) {
  const references = [];
  const importPattern = /(?:\bfrom\s*|\bimport\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
  const sideEffectPattern = /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g;
  let match;
  while ((match = importPattern.exec(source))) references.push(match[1]);
  while ((match = sideEffectPattern.exec(source))) references.push(match[1]);
  return references;
}

function collectServiceWorkerPrecacheReferences(source) {
  const match = source.match(/const CRITICAL_ASSETS = Object\.freeze\((\[[\s\S]*?\])\);/);
  if (!match) throw new Error('staged sw.js does not contain a generated CRITICAL_ASSETS array');
  const assets = JSON.parse(match[1]);
  if (!Array.isArray(assets) || assets.some((asset) => typeof asset !== 'string')) {
    throw new Error('staged sw.js CRITICAL_ASSETS must be an array of strings');
  }
  if (new Set(assets).size !== assets.length) {
    throw new Error('staged sw.js CRITICAL_ASSETS contains duplicate entries');
  }
  return assets;
}

function assertReferenceExists(outDir, sourceFile, reference, errors) {
  const target = resolveLocalReference(outDir, sourceFile, reference);
  if (!target) return;
  const relative = path.relative(outDir, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    errors.push(`${path.relative(outDir, sourceFile)} references a path outside the build: ${reference}`);
    return;
  }
  if (!fs.existsSync(target)) {
    errors.push(`${path.relative(outDir, sourceFile)} references missing asset: ${reference}`);
  }
}

function verifyManifest(outDir, errors) {
  const manifestPath = path.join(outDir, manifestName);
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${manifestName} is missing.`);
    return 0;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`${manifestName} is not valid JSON: ${error.message}`);
    return 0;
  }
  const expected = manifest && typeof manifest.files === 'object' ? manifest.files : {};
  const actualFiles = listFiles(outDir)
    .map((absolute) => path.relative(outDir, absolute).split(path.sep).join('/'))
    .filter((relative) => relative !== manifestName);
  const actualSet = new Set(actualFiles);
  for (const [relative, expectedHash] of Object.entries(expected)) {
    const absolute = path.join(outDir, relative);
    if (!actualSet.has(relative)) {
      errors.push(`Manifest file is missing: ${relative}`);
      continue;
    }
    if (sha256(absolute) !== expectedHash) errors.push(`Manifest checksum mismatch: ${relative}`);
  }
  for (const relative of actualFiles) {
    if (!Object.prototype.hasOwnProperty.call(expected, relative)) {
      errors.push(`Build contains an unmanifested file: ${relative}`);
    }
  }
  return actualFiles.length;
}

function verifyWebBuild(options = {}) {
  const outDir = path.resolve(options.outDir || defaultOutDir);
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
    throw new Error(`Web build directory does not exist: ${outDir}`);
  }
  const errors = [];
  for (const item of requiredItems) {
    if (!fs.existsSync(path.join(outDir, item))) errors.push(`Required build item is missing: ${item}`);
  }

  const files = listFiles(outDir);
  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs', '.cjs', '.webmanifest'].includes(extension)) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    const normalizedRelative = path.relative(outDir, filePath).split(path.sep).join('/');
    if (/node_modules[\\/]/i.test(source)) errors.push(`${normalizedRelative} contains a node_modules runtime reference.`);
    if (['index.html', 'NexPlay.mobile.html'].includes(normalizedRelative)) {
      for (const host of remoteUiHosts) {
        if (source.includes(host)) errors.push(`${normalizedRelative} still depends on remote UI host ${host}.`);
      }
    }
    if (normalizedRelative === 'index.html') {
      const manifestLinks = source.match(/<link\s+rel=["']manifest["']\s+href=["']\.\/manifest\.webmanifest["']\s*>/gi) || [];
      const workerRegistrations = source.match(/navigator\.serviceWorker\.register\(["']\.\/sw\.js["']\)/g) || [];
      if (manifestLinks.length !== 1) {
        errors.push('index.html must contain exactly one staged desktop web manifest link.');
      }
      if (workerRegistrations.length !== 1) {
        errors.push('index.html must contain exactly one staged desktop service worker registration.');
      }
    }
    let references = [];
    if (extension === '.html') references = collectHtmlReferences(source);
    else if (extension === '.css') references = collectCssReferences(source);
    else if (['.js', '.mjs', '.cjs'].includes(extension)) {
      references = collectModuleReferences(source);
      if (normalizedRelative === 'sw.js') {
        try {
          references.push(...collectServiceWorkerPrecacheReferences(source));
        } catch (error) {
          errors.push(error.message);
        }
      }
    }
    else if (extension === '.webmanifest') {
      try {
        const manifest = JSON.parse(source);
        references = [manifest.start_url, ...(manifest.icons || []).map((icon) => icon.src)].filter(Boolean);
      } catch (error) {
        errors.push(`${normalizedRelative} is invalid JSON: ${error.message}`);
      }
    }
    for (const reference of references) assertReferenceExists(outDir, filePath, reference, errors);
  }

  const fileCount = verifyManifest(outDir, errors);
  if (errors.length) {
    throw new Error(`NexPlay web build verification failed:\n- ${errors.join('\n- ')}`);
  }
  if (!options.quiet) console.log(`NexPlay web build verified: ${fileCount} files, all local references and checksums valid.`);
  return { outDir, fileCount };
}

function readOutArgument(argv) {
  const index = argv.indexOf('--out');
  if (index < 0) return defaultOutDir;
  const value = argv[index + 1];
  if (!value) throw new Error('Missing value after --out.');
  return path.resolve(process.cwd(), value);
}

module.exports = {
  collectCssReferences,
  collectHtmlReferences,
  collectModuleReferences,
  collectServiceWorkerPrecacheReferences,
  verifyWebBuild,
};

if (require.main === module) {
  verifyWebBuild({ outDir: readOutArgument(process.argv.slice(2)) });
}
