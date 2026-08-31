// @ts-nocheck -- Focused DOM behavior harness uses lightweight test doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
const appInitSource = fs.readFileSync(new URL('../js/legacy/app-init.js', import.meta.url), 'utf8');

function countId(source, id) {
  return [...source.matchAll(new RegExp(`\\bid=["']${id}["']`, 'g'))].length;
}

function createClassList() {
  const values = new Set();
  return {
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force === undefined ? !values.has(value) : force) values.add(value);
      else values.delete(value);
      return values.has(value);
    },
  };
}

function createHeaderOverflowSubject({ inline = false } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };

  function createElement(id) {
    const listeners = new Map();
    const attributes = new Map();
    return {
      id,
      attributes,
      classList: createClassList(),
      dataset: {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      contains(target) {
        return target === this;
      },
      dispatch(type, overrides = {}) {
        const event = {
          key: '',
          target: this,
          defaultPrevented: false,
          propagationStopped: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
          stopPropagation() {
            this.propagationStopped = true;
          },
          ...overrides,
        };
        listeners.get(type)?.(event);
        return event;
      },
      focus() {
        document.activeElement = this;
      },
      getAttribute(name) {
        return attributes.has(name) ? attributes.get(name) : null;
      },
      hasAttribute(name) {
        return attributes.has(name);
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      listenerCount() {
        return listeners.size;
      },
    };
  }

  const overflow = createElement('header-overflow');
  const trigger = createElement('header-more-trigger');
  const panel = createElement('header-overflow-panel');
  const controls = [
    createElement('command-palette-trigger'),
    createElement('sort-select'),
    createElement('view-list-btn'),
    createElement('multi-select-toggle'),
  ];
  panel.querySelectorAll = () => controls;
  panel.contains = (target) => target === panel || controls.includes(target);
  overflow.contains = (target) => target === overflow || target === trigger || panel.contains(target);

  const elements = new Map([
    [overflow.id, overflow],
    [trigger.id, trigger],
    [panel.id, panel],
  ]);
  document.getElementById = (id) => elements.get(id) || null;

  const media = {
    matches: inline,
    addEventListener(type, listener) {
      mediaListeners.set(type, listener);
    },
  };
  const window = {
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    matchMedia(query) {
      assert.equal(query, '(min-width: 1500px)');
      return media;
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };

  const start = appInitSource.indexOf('function setupHeaderOverflowControls()');
  const end = appInitSource.indexOf('\nfunction setupEventListeners()', start);
  assert.notEqual(start, -1, 'header overflow setup should exist');
  assert.notEqual(end, -1, 'header overflow setup boundary should exist');
  const context = vm.createContext({ document, window });
  new vm.Script(`${appInitSource.slice(start, end)}\nglobalThis.__setup = setupHeaderOverflowControls;`)
    .runInContext(context);
  context.__setup();

  return {
    context,
    controls,
    document,
    media,
    overflow,
    panel,
    trigger,
    dispatchDocument(type, target) {
      documentListeners.get(type)?.({ target });
    },
    dispatchResize() {
      windowListeners.get('resize')?.();
    },
    dispatchMediaChange() {
      mediaListeners.get('change')?.({ matches: media.matches });
    },
  };
}

test('header keeps one copy of every action and an accessible labeled overflow group', () => {
  const ids = [
    'header-more-trigger',
    'header-overflow-panel',
    'command-palette-trigger',
    'sort-select',
    'view-mode-toggle',
    'view-list-btn',
    'view-grid-btn',
    'multi-select-toggle',
    'import-media-btn',
    'import-media-btn-mobile',
  ];
  for (const id of ids) assert.equal(countId(html, id), 1, `${id} should be unique`);

  const actionStart = html.indexOf('id="header-actions"');
  const overflowStart = html.indexOf('id="header-overflow"', actionStart);
  const mobileImportStart = html.indexOf('<!-- Mobile Import -->', overflowStart);
  assert.ok(actionStart >= 0 && overflowStart > actionStart && mobileImportStart > overflowStart);
  assert.ok(html.indexOf('id="import-media-btn"', actionStart) < overflowStart, 'Import stays primary');
  const overflowMarkup = html.slice(overflowStart, mobileImportStart);
  for (const id of ['command-palette-trigger', 'sort-select', 'view-mode-toggle', 'multi-select-toggle']) {
    assert.match(overflowMarkup, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(overflowMarkup, /id=["']import-media-btn["']/);
  assert.match(html, /id="header-more-trigger"[^>]*aria-expanded="false"[^>]*aria-controls="header-overflow-panel"[^>]*aria-haspopup="true"/);
  assert.match(html, /id="header-overflow-panel"[^>]*role="group"[^>]*aria-label="Library command, sorting, view, and selection controls"[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(overflowMarkup, /id="command-palette-trigger" onclick="openCommandPalette\(\)"/);
  assert.match(overflowMarkup, /id="sort-select"[^>]*onchange="setSortMode\(this\.value\)"/);
  assert.match(overflowMarkup, /id="view-list-btn"[^>]*onclick="setViewMode\('list'\)"|onclick="setViewMode\('list'\)"[^>]*id="view-list-btn"/);
  assert.match(overflowMarkup, /id="multi-select-toggle" onclick="toggleMultiSelectMode\(\)"/);
  assert.match(html, /id="import-media-btn" onclick="requestMediaImport\(\)"/);
  assert.match(html, /id="import-media-btn-mobile" onclick="requestMediaImport\(\)"/);
});

test('responsive CSS switches one group between popover and inline layouts without hiding actions', () => {
  assert.match(css, /#header-primary-cluster[\s\S]*?min-width:\s*0/);
  assert.match(css, /#header-search-wrap[\s\S]*?flex:\s*1 1 20rem[\s\S]*?max-width:\s*20rem/);
  assert.match(css, /@media \(max-width: 767\.98px\)[\s\S]*?#library-toggle-online-label\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1499\.98px\)[\s\S]*?#header-search-wrap[\s\S]*?min-width:\s*8rem/);
  assert.match(css, /\.header-overflow-panel\.is-open[\s\S]*?visibility:\s*visible[\s\S]*?pointer-events:\s*auto/);
  assert.match(css, /@media \(min-width: 1500px\)[\s\S]*?\.header-more-trigger\s*\{[\s\S]*?display:\s*none[\s\S]*?\.header-overflow-panel\s*\{[\s\S]*?position:\s*static/);
  assert.doesNotMatch(css, /#multi-select-toggle\s*\{[^}]*display:\s*none/s);
});

test('popover behavior supports keyboard focus, outside close, resize close, and inline mode', () => {
  const subject = createHeaderOverflowSubject();
  assert.equal(subject.panel.dataset.presentation, 'popover');
  assert.equal(subject.panel.getAttribute('aria-hidden'), 'true');
  assert.equal(subject.panel.hasAttribute('inert'), true);
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'false');

  subject.trigger.dispatch('click');
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(subject.panel.classList.contains('is-open'), true);
  assert.equal(subject.panel.getAttribute('aria-hidden'), 'false');
  assert.equal(subject.panel.hasAttribute('inert'), false);
  assert.equal(subject.document.activeElement, subject.controls[0]);

  const escape = subject.panel.dispatch('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(subject.document.activeElement, subject.trigger);

  subject.trigger.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(subject.document.activeElement, subject.controls.at(-1));
  subject.dispatchDocument('pointerdown', { id: 'outside' });
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'false');

  subject.trigger.dispatch('click');
  subject.dispatchDocument('focusin', { id: 'next-control' });
  assert.equal(subject.panel.hasAttribute('inert'), true);

  subject.trigger.dispatch('click');
  assert.equal(subject.document.activeElement, subject.controls[0]);
  subject.dispatchResize();
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(subject.document.activeElement, subject.trigger);

  subject.media.matches = true;
  subject.dispatchMediaChange();
  assert.equal(subject.panel.dataset.presentation, 'inline');
  assert.equal(subject.panel.getAttribute('aria-hidden'), 'false');
  assert.equal(subject.panel.hasAttribute('inert'), false);
  assert.equal(subject.trigger.getAttribute('aria-expanded'), 'false');

  const listenerCount = subject.trigger.listenerCount();
  subject.context.__setup();
  assert.equal(subject.trigger.listenerCount(), listenerCount, 'setup should bind only once');
});

test('hidden YouTube shell retains its exact 200 by 200 inert geometry', () => {
  const normalizedHtml = html.replace(/\r\n/g, '\n');
  const normalizedCss = css.replace(/\r\n/g, '\n');
  assert.match(normalizedHtml, /<div id="online-music-player-shell" class="online-music-player-hidden" aria-hidden="true" inert>\n\s*<div id="online-music-yt-player"><\/div>\n\s*<\/div>/);
  assert.match(normalizedCss, /\.online-music-player-hidden \{\n\s*position: fixed;\n\s*left: -9999px;\n\s*top: 0;\n\s*width: 200px;\n\s*height: 200px;\n\s*opacity: 0;\n\s*pointer-events: none;\n\s*overflow: hidden;\n\}/);
  assert.match(normalizedCss, /\.online-music-player-hidden #online-music-yt-player,\n\.online-music-player-hidden iframe \{\n\s*width: 200px !important;\n\s*height: 200px !important;\n\s*border: 0;\n\s*pointer-events: none;\n\}/);
});
