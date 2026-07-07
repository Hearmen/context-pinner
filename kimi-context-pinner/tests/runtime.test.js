const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

function loadRuntime(html = '<body></body>', options = {}) {
  const dom = new JSDOM(html, { url: options.url || 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.chrome = options.chrome;
  global.KCP = options.KCP || {
    DEFAULT_TEMPLATES: [{ id: 'default', title: 'Default', body: 'Default body' }],
    normalizeSettings(settings = {}) {
      return {
        enabled: settings.enabled !== false,
        templates: settings.templates || this.DEFAULT_TEMPLATES,
        activeTemplateId: settings.activeTemplateId || (settings.templates || this.DEFAULT_TEMPLATES)[0].id
      };
    },
    getActiveTemplate(settings) {
      return settings.templates.find((item) => item.id === settings.activeTemplateId);
    },
    loadSettings: () => Promise.resolve({
      enabled: true,
      templates: [{ id: 'active', title: 'Active', body: 'Template body' }],
      activeTemplateId: 'active'
    }),
    wrapPrompt: (template, input) => input.trim() ? `[${template}]${input}` : input,
    getSupportedSite: () => ({ indicatorText: 'Provider enabled' }),
    syncEnabledIndicator() {}
  };

  delete require.cache[require.resolve('../src/content/runtime.js')];
  require('../src/content/runtime.js');

  const adapter = options.adapter || {
    findEditor: () => document.querySelector('[data-editor]'),
    findSendButton: () => document.querySelector('[data-send]'),
    readEditorText: (editor) => editor.textContent,
    replaceEditorText(editor, text) {
      editor.textContent = text;
      return true;
    }
  };
  return { dom, KCP: global.KCP, adapter, runtime: global.KCP.createContentRuntime(adapter) };
}

test('createContentRuntime validates every required adapter method', () => {
  const { KCP } = loadRuntime();
  for (const method of ['findEditor', 'findSendButton', 'readEditorText', 'replaceEditorText']) {
    const adapter = {
      findEditor() {}, findSendButton() {}, readEditorText() {}, replaceEditorText() {}
    };
    delete adapter[method];
    assert.throws(() => KCP.createContentRuntime(adapter), {
      name: 'TypeError', message: `Content adapter must provide ${method}()`
    });
  }
});

test('refresh loads active template and syncs enabled and disabled indicators', async () => {
  const { KCP, runtime } = loadRuntime('<body><div data-editor>question</div></body>');
  const calls = [];
  KCP.syncEnabledIndicator = (...args) => calls.push(args);
  await runtime.refreshActiveTemplate();
  assert.equal(runtime.wrapCurrentEditorInput(), true);
  assert.deepEqual(calls, [[true, 'Provider enabled']]);

  KCP.loadSettings = () => Promise.resolve({
    enabled: false,
    templates: [{ id: 'off', title: 'Off', body: 'Unused' }],
    activeTemplateId: 'off'
  });
  await runtime.refreshActiveTemplate();
  assert.deepEqual(calls.at(-1), [false, 'Provider enabled']);
});

test('document Enter capture wraps before later page handlers', () => {
  const { dom, runtime } = loadRuntime('<body><div data-editor>question</div></body>');
  runtime.setCachedTemplateBodyForTest('Context');
  runtime.bindProviderDom();
  runtime.start();
  const seen = [];
  document.addEventListener('keydown', () => seen.push(document.querySelector('[data-editor]').textContent));
  document.querySelector('[data-editor]').dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true
  }));
  assert.deepEqual(seen, ['[Context]question']);
});

test('Shift+Enter and composing Enter are untouched', () => {
  const { dom, runtime } = loadRuntime('<body><div data-editor>question</div></body>');
  runtime.setCachedTemplateBodyForTest('Context');
  runtime.start();
  const editor = document.querySelector('[data-editor]');
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  assert.equal(editor.textContent, 'question');
});

test('send click wraps before page handler and document plus target paths wrap once', () => {
  let replacements = 0;
  const adapter = {
    findEditor: () => document.querySelector('[data-editor]'),
    findSendButton: () => document.querySelector('[data-send]'),
    readEditorText: (editor) => editor.textContent,
    replaceEditorText(editor, text) { replacements += 1; editor.textContent = text; return true; }
  };
  const { dom, runtime } = loadRuntime('<body><div data-editor>question</div><button data-send><span>go</span></button></body>', { adapter });
  runtime.setCachedTemplateBodyForTest('Context');
  runtime.bindProviderDom();
  runtime.bindProviderDom();
  runtime.start();
  const seen = [];
  document.querySelector('[data-send]').addEventListener('click', () => seen.push(document.querySelector('[data-editor]').textContent));
  document.querySelector('[data-send] span').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(seen, ['[Context]question']);
  assert.equal(replacements, 1);
});

test('disabled, blank template, blank input, and failed replacement do not wrap', () => {
  const { runtime, adapter } = loadRuntime('<body><div data-editor>question</div></body>');
  runtime.setEnabledForTest(false);
  runtime.setCachedTemplateBodyForTest('Context');
  assert.equal(runtime.wrapCurrentEditorInput(), false);
  runtime.setEnabledForTest(true);
  runtime.setCachedTemplateBodyForTest('   ');
  assert.equal(runtime.wrapCurrentEditorInput(), false);
  runtime.setCachedTemplateBodyForTest('Context');
  document.querySelector('[data-editor]').textContent = '   ';
  assert.equal(runtime.wrapCurrentEditorInput(), false);
  document.querySelector('[data-editor]').textContent = 'question';
  adapter.replaceEditorText = () => false;
  assert.equal(runtime.wrapCurrentEditorInput(), false);
});

test('older settings request cannot overwrite a newer result', async () => {
  const { KCP, runtime } = loadRuntime('<body><div data-editor>question</div></body>');
  const old = deferred();
  const current = deferred();
  let call = 0;
  KCP.loadSettings = () => (++call === 1 ? old.promise : current.promise);
  const olderRefresh = runtime.refreshActiveTemplate();
  const newerRefresh = runtime.refreshActiveTemplate();
  current.resolve({ enabled: true, templates: [{ id: 'new', title: 'New', body: 'New' }], activeTemplateId: 'new' });
  await newerRefresh;
  old.resolve({ enabled: false, templates: [{ id: 'old', title: 'Old', body: 'Old' }], activeTemplateId: 'old' });
  await olderRefresh;
  assert.equal(runtime.wrapCurrentEditorInput(), true);
  assert.equal(document.querySelector('[data-editor]').textContent, '[New]question');
});

test('start adds indicator after body appears and does not mutation-loop', async () => {
  const { dom, KCP, runtime } = loadRuntime('<html><head></head><body></body></html>');
  document.body.remove();
  let syncCalls = 0;
  KCP.syncEnabledIndicator = (enabled, text) => {
    syncCalls += 1;
    if (enabled && document.body && !document.getElementById('indicator')) {
      const indicator = document.createElement('div');
      indicator.id = 'indicator';
      indicator.textContent = text;
      document.body.appendChild(indicator);
    }
  };
  runtime.start();
  await flushMutations();
  const body = document.createElement('body');
  document.documentElement.appendChild(body);
  await flushMutations();
  assert.equal(document.getElementById('indicator').textContent, 'Provider enabled');
  await flushMutations();
  assert.ok(syncCalls <= 2);
  dom.window.close();
});

test('storage refresh filters area and keys while allowing undefined areaName', async () => {
  let listener;
  const chrome = { storage: { onChanged: { addListener(fn) { listener = fn; } } } };
  const { KCP, runtime } = loadRuntime('<body></body>', { chrome });
  let loads = 0;
  KCP.loadSettings = async () => { loads += 1; return { enabled: true, templates: [{ id: 'a', title: 'A', body: 'A' }], activeTemplateId: 'a' }; };
  runtime.start();
  await flushMutations();
  listener({ enabled: {} }, 'local');
  listener({ unrelated: {} }, 'sync');
  listener({ templates: {} }, 'sync');
  listener({ activeTemplateId: {} });
  await flushMutations();
  assert.equal(loads, 3);
});

test('missing optional KCP helpers fail safely', async () => {
  const KCP = { DEFAULT_TEMPLATES: [{ body: 'Fallback' }] };
  const { runtime } = loadRuntime('<body><div data-editor>question</div></body>', { KCP });
  await assert.doesNotReject(runtime.refreshActiveTemplate());
  assert.equal(runtime.wrapCurrentEditorInput(), false);
  assert.doesNotThrow(() => runtime.start());
});

test('throwing indicator helper cannot reject refresh or escape the observer', async () => {
  const { dom, KCP, runtime } = loadRuntime('<html><head></head><body></body></html>');
  KCP.syncEnabledIndicator = () => { throw new Error('indicator unavailable'); };

  await assert.doesNotReject(runtime.refreshActiveTemplate());

  document.body.remove();
  const escapedErrors = [];
  dom.window.addEventListener('error', (event) => {
    escapedErrors.push(event.error);
    event.preventDefault();
  });
  runtime.start();
  await flushMutations();
  document.documentElement.appendChild(document.createElement('body'));
  await flushMutations();
  assert.deepEqual(escapedErrors, []);
});

test('runtime instances keep enabled, template, and refresh request versions independent', async () => {
  const { KCP } = loadRuntime('<body><div id="one">one</div><div id="two">two</div></body>');
  const pending = [];
  KCP.loadSettings = () => {
    const request = deferred();
    pending.push(request);
    return request.promise;
  };
  const adapterFor = (id) => ({
    findEditor: () => document.getElementById(id),
    findSendButton: () => null,
    readEditorText: (editor) => editor.textContent,
    replaceEditorText(editor, text) { editor.textContent = text; return true; }
  });
  const first = KCP.createContentRuntime(adapterFor('one'));
  const second = KCP.createContentRuntime(adapterFor('two'));

  const firstOld = first.refreshActiveTemplate();
  const firstNew = first.refreshActiveTemplate();
  const secondOnly = second.refreshActiveTemplate();
  pending[2].resolve({ enabled: true, templates: [{ id: 'two', title: 'Two', body: 'Second' }], activeTemplateId: 'two' });
  await secondOnly;
  pending[1].resolve({ enabled: false, templates: [{ id: 'off', title: 'Off', body: 'Disabled' }], activeTemplateId: 'off' });
  await firstNew;
  pending[0].resolve({ enabled: true, templates: [{ id: 'old', title: 'Old', body: 'Stale' }], activeTemplateId: 'old' });
  await firstOld;

  assert.equal(first.wrapCurrentEditorInput(), false);
  assert.equal(document.getElementById('one').textContent, 'one');
  assert.equal(second.wrapCurrentEditorInput(), true);
  assert.equal(document.getElementById('two').textContent, '[Second]two');
});

test('MutationObserver binds dynamically inserted provider controls once', async () => {
  let replacements = 0;
  const adapter = {
    findEditor: () => document.querySelector('[data-editor]'),
    findSendButton: () => document.querySelector('[data-send]'),
    readEditorText: (editor) => editor.textContent,
    replaceEditorText(editor, text) { replacements += 1; editor.textContent = text; return true; }
  };
  const { dom, runtime } = loadRuntime('<body></body>', { adapter });
  runtime.start();
  await flushMutations();
  runtime.setCachedTemplateBodyForTest('Dynamic');

  const editor = document.createElement('div');
  editor.dataset.editor = '';
  editor.textContent = 'question';
  const button = document.createElement('button');
  button.dataset.send = '';
  document.body.append(editor, button);
  await flushMutations();
  document.body.append(document.createElement('span'));
  await flushMutations();

  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(replacements, 2);
  assert.equal(editor.textContent, '[Dynamic][Dynamic]question');
});
