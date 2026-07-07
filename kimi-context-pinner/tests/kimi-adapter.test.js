const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadAdapter(html) {
  const dom = new JSDOM(html, { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.KCP = {};
  global.__KCP_TEST__ = true;
  delete require.cache[require.resolve('../src/sites/kimi.js')];
  require('../src/sites/kimi.js');
  return { dom, adapter: global.KCP.createKimiAdapter() };
}

test.afterEach(() => {
  delete global.__KCP_TEST__;
  delete global.KCP;
});

test('findEditor prefers the Kimi primary editor and supports the role fallback', () => {
  let loaded = loadAdapter(`
    <div role="textbox" contenteditable="true">fallback</div>
    <div class="chat-input-editor" contenteditable="true">primary</div>
  `);
  assert.equal(loaded.adapter.id, 'kimi');
  assert.equal(loaded.adapter.readEditorText(loaded.adapter.findEditor()), 'primary');
  loaded.dom.window.close();

  loaded = loadAdapter('<div role="textbox" contenteditable="true">fallback</div>');
  assert.equal(loaded.adapter.readEditorText(loaded.adapter.findEditor()), 'fallback');
  loaded.dom.window.close();
});

test('findSendButton resolves the send icon container and parent fallback', () => {
  let loaded = loadAdapter('<div class="chat-editor"><button class="send-button-container"><i class="send-icon"></i></button></div>');
  assert.equal(loaded.adapter.findSendButton().className, 'send-button-container');
  loaded.dom.window.close();

  loaded = loadAdapter('<button id="parent"><i class="send-icon"></i></button>');
  assert.equal(loaded.adapter.findSendButton().id, 'parent');
  loaded.dom.window.close();
});

test('replaceEditorText rejects a missing editor', () => {
  const { dom, adapter } = loadAdapter('<body></body>');
  assert.equal(adapter.replaceEditorText(null, 'new'), false);
  dom.window.close();
});

test('replaceEditorText dispatches input and change after execCommand visibly succeeds', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  const events = [];
  editor.addEventListener('input', (event) => events.push([event.type, event.bubbles]));
  editor.addEventListener('change', (event) => events.push([event.type, event.bubbles]));
  document.execCommand = (_command, _showUi, text) => {
    editor.textContent = text;
    return true;
  };

  assert.equal(adapter.replaceEditorText(editor, 'new'), true);

  assert.equal(document.activeElement, editor);
  assert.equal(editor.textContent, 'new');
  assert.deepEqual(events, [['input', true], ['change', true]]);
  dom.window.close();
});

test('replaceEditorText rejects false and fake-success execCommand without mutating or dispatching', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  const events = [];
  editor.addEventListener('input', () => events.push('input'));
  editor.addEventListener('change', () => events.push('change'));
  Object.defineProperty(editor, 'textContent', {
    configurable: true,
    get: () => 'old',
    set() { throw new Error('production fallback must not assign textContent'); }
  });

  document.execCommand = () => false;
  assert.equal(adapter.replaceEditorText(editor, 'new'), false);
  document.execCommand = () => true;
  assert.equal(adapter.replaceEditorText(editor, 'new'), false);
  assert.equal(editor.textContent, 'old');
  assert.deepEqual(events, []);
  dom.window.close();
});

test('replaceEditorText accepts execCommand only when observable text matches', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  document.execCommand = (_command, _showUi, text) => {
    editor.textContent = text;
    return true;
  };

  assert.equal(adapter.replaceEditorText(editor, 'new'), true);
  assert.equal(adapter.readEditorText(editor), 'new');
  dom.window.close();
});

test('replaceEditorText uses the Lexical editor state without execCommand', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  let currentText = 'old';
  let execCommandCalled = false;
  Object.defineProperty(editor, 'textContent', { configurable: true, get: () => currentText, set() {} });
  editor.__lexicalEditor = {
    parseEditorState: JSON.parse,
    setEditorState(state) { currentText = state.root.children[0].children[0].text; }
  };
  document.execCommand = () => { execCommandCalled = true; return true; };

  assert.equal(adapter.replaceEditorText(editor, 'new exact text'), true);
  assert.equal(currentText, 'new exact text');
  assert.equal(execCommandCalled, false);
  dom.window.close();
});

test('replaceEditorText treats delayed Lexical DOM synchronization as success', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  let lexicalText = 'old';
  let execCommandCalled = false;
  editor.__lexicalEditor = {
    parseEditorState: JSON.parse,
    setEditorState(state) { lexicalText = state.root.children[0].children[0].text; }
  };
  document.execCommand = () => { execCommandCalled = true; return true; };

  assert.equal(adapter.replaceEditorText(editor, 'new exact text'), true);
  assert.equal(lexicalText, 'new exact text');
  assert.equal(editor.textContent, 'old');
  assert.equal(execCommandCalled, false);
  dom.window.close();
});

test('replaceEditorText stops after a successful MAIN page bridge event', () => {
  const { dom, adapter } = loadAdapter('<div class="chat-input-editor" contenteditable="true">old</div>');
  const editor = adapter.findEditor();
  let bridgeText = '';
  let execCommandCalled = false;
  document.addEventListener('kcp:set-editor-text', (event) => {
    const payload = JSON.parse(event.detail);
    bridgeText = payload.text;
    document.documentElement.setAttribute('data-kcp-page-replace-result', `${payload.nonce}:true`);
  }, true);
  document.execCommand = () => { execCommandCalled = true; return true; };

  assert.equal(adapter.replaceEditorText(editor, 'new exact text'), true);
  assert.equal(bridgeText, 'new exact text');
  assert.equal(execCommandCalled, false);
  dom.window.close();
});

test('starts the shared runtime outside test mode', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  let receivedAdapter;
  let starts = 0;
  global.KCP = {
    createContentRuntime(adapter) {
      receivedAdapter = adapter;
      return { start() { starts += 1; } };
    }
  };
  delete global.__KCP_TEST__;
  delete require.cache[require.resolve('../src/sites/kimi.js')];
  require('../src/sites/kimi.js');
  assert.equal(receivedAdapter.id, 'kimi');
  assert.equal(starts, 1);
  dom.window.close();
});

function loadManifestRuntime(html, loadSettings) {
  const dom = new JSDOM(html, { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.chrome = undefined;
  global.KCP = {};
  global.__KCP_TEST__ = true;
  for (const file of [
    '../src/shared/sites.js',
    '../src/shared/defaults.js',
    '../src/shared/prompt.js',
    '../src/shared/storage.js',
    '../src/content/indicator.js',
    '../src/content/runtime.js',
    '../src/sites/kimi.js'
  ]) {
    delete require.cache[require.resolve(file)];
    require(file);
  }
  global.KCP.loadSettings = loadSettings || (() => Promise.resolve(global.KCP.normalizeSettings({})));
  const adapter = global.KCP.createKimiAdapter();
  const runtime = global.KCP.createContentRuntime(adapter);
  return { dom, adapter, runtime };
}

test('manifest-order runtime waits for settings then wraps Enter once through the synchronous MAIN bridge', async () => {
  let resolveSettings;
  const settings = new Promise((resolve) => { resolveSettings = resolve; });
  const { dom, adapter, runtime } = loadManifestRuntime(
    '<div class="chat-input-editor" contenteditable="true">question</div>',
    () => settings
  );
  const editor = adapter.findEditor();
  document.addEventListener('kcp:set-editor-text', (event) => {
    const payload = JSON.parse(event.detail);
    editor.textContent = payload.text;
    document.documentElement.setAttribute('data-kcp-page-replace-result', `${payload.nonce}:true`);
  }, true);
  runtime.start();

  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(editor.textContent, 'question');

  resolveSettings({
    enabled: true,
    templates: [{ id: 'custom', title: 'Custom', body: 'Kimi custom' }],
    activeTemplateId: 'custom'
  });
  await Promise.resolve();
  await Promise.resolve();
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.equal(editor.textContent, '请按以下上下文处理用户输入。上下文模板：Kimi custom用户输入：question');
  dom.window.close();
});

test('runtime preserves input until settings load and a reliable bridge becomes available', async () => {
  const { dom, adapter, runtime } = loadManifestRuntime('<div class="chat-input-editor" contenteditable="true">question</div>');
  const editor = adapter.findEditor();
  document.execCommand = () => false;
  runtime.start();
  await Promise.resolve();
  await Promise.resolve();

  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(editor.textContent, 'question');

  document.addEventListener('kcp:set-editor-text', (event) => {
    const payload = JSON.parse(event.detail);
    editor.textContent = payload.text;
    document.documentElement.setAttribute('data-kcp-page-replace-result', `${payload.nonce}:true`);
  }, true);
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.match(editor.textContent, /用户输入：question$/);
  dom.window.close();
});
