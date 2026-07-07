const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const activeDoms = new Set();

function loadAdapter(html, options = {}) {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/' });
  activeDoms.add(dom);
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.chrome = options.chrome;
  global.KCP = options.KCP || {};
  global.__KCP_TEST__ = true;
  delete require.cache[require.resolve('../src/sites/chatgpt.js')];
  require('../src/sites/chatgpt.js');
  return { dom, adapter: global.KCP.createChatGPTAdapter() };
}

test.afterEach(() => {
  for (const dom of activeDoms) dom.window.close();
  activeDoms.clear();
  delete global.window;
  delete global.document;
  delete global.MutationObserver;
  delete global.chrome;
  delete global.KCP;
  delete global.__KCP_TEST__;
});

test('findEditor prefers prompt-textarea and limits ProseMirror fallback to a composer form', () => {
  let loaded = loadAdapter(`
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true">fallback</div><div id="prompt-textarea" contenteditable="true">primary</div></form>
  `);
  assert.equal(loaded.adapter.id, 'chatgpt');
  assert.equal(loaded.adapter.findEditor().id, 'prompt-textarea');

  loaded = loadAdapter(`
    <div class="ProseMirror" contenteditable="true">outside</div>
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true">inside</div></form>
  `);
  assert.equal(loaded.adapter.readEditorText(loaded.adapter.findEditor()), 'inside');
});

test('findEditor rejects hidden, aria-hidden, and unrelated editable elements', () => {
  const { adapter } = loadAdapter(`
    <div role="textbox" contenteditable="true">unrelated role</div>
    <div contenteditable="true">unrelated editable</div>
    <form data-type="unified-composer" hidden><div class="ProseMirror" contenteditable="true">hidden form</div></form>
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true" aria-hidden="true">aria hidden</div></form>
  `);
  assert.equal(adapter.findEditor(), null);
});

test('findEditor skips a hidden primary and hidden old composer for the active fallback', () => {
  const { adapter } = loadAdapter(`
    <form data-type="unified-composer" style="display:none"><div id="prompt-textarea" contenteditable="true">hidden primary</div></form>
    <form data-type="unified-composer" aria-hidden="true"><div class="ProseMirror" contenteditable="true">old</div></form>
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true">active</div></form>
  `);
  assert.equal(adapter.readEditorText(adapter.findEditor()), 'active');
});

test('findSendButton prefers an enabled send test id and falls back to enabled submit in the editor composer', () => {
  let loaded = loadAdapter(`
    <form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true"></div><button type="submit">fallback</button><button data-testid="send-button">send</button></form>
  `);
  assert.equal(loaded.adapter.findSendButton().dataset.testid, 'send-button');

  loaded = loadAdapter(`
    <button type="submit" id="outside">outside</button>
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true"></div><button type="submit" id="inside">inside</button></form>
  `);
  assert.equal(loaded.adapter.findSendButton().id, 'inside');
});

test('findSendButton rejects disabled primary and disabled fallback buttons', () => {
  let loaded = loadAdapter(`
    <form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button" disabled>disabled</button><button type="submit" id="fallback">go</button></form>
  `);
  assert.equal(loaded.adapter.findSendButton().id, 'fallback');

  loaded = loadAdapter(`
    <form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button" aria-disabled="true">disabled</button><button type="submit" disabled>disabled fallback</button><button type="button" data-testid="stop-button">stop</button><button type="button">voice</button></form>
  `);
  assert.equal(loaded.adapter.findSendButton(), null);
});

test('findSendButton stays inside the active editor composer when stale composers remain', () => {
  const { adapter } = loadAdapter(`
    <form data-type="unified-composer" style="visibility:hidden"><div class="ProseMirror" contenteditable="true">old</div><button data-testid="send-button" id="old-send">old</button></form>
    <form data-type="unified-composer"><div class="ProseMirror" contenteditable="true">active</div><button data-testid="send-button" id="active-send">send</button></form>
    <button data-testid="send-button" id="outside-send">outside</button>
  `);
  assert.equal(adapter.findSendButton().id, 'active-send');
});

test('readEditorText uses an editor-local innerText fallback in jsdom', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">hello</div><span id="other">other</span></form>');
  const editor = adapter.findEditor();
  assert.equal(adapter.readEditorText(editor), 'hello');
  assert.equal(editor.innerText, 'hello');
  assert.equal(typeof document.getElementById('other').innerText, 'undefined');
  assert.equal(adapter.readEditorText(null), '');
});

test('readEditorText preserves browser-style paragraph newlines through innerText', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true"><p>one</p><p>two</p></div></form>');
  const editor = adapter.findEditor();
  Object.defineProperty(editor, 'innerText', { configurable: true, value: 'one\ntwo' });
  assert.equal(adapter.readEditorText(editor), 'one\ntwo');
  assert.equal(editor.textContent, 'onetwo');
});

test('replaceEditorText focuses, selects, and uses successful execCommand without duplicate events', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">old</div></form>');
  const editor = adapter.findEditor();
  const events = [];
  editor.addEventListener('input', (event) => events.push([event.type, event.inputType, event.data]));
  editor.addEventListener('change', (event) => events.push([event.type]));
  document.execCommand = (command, showUi, text) => {
    assert.equal(command, 'insertText');
    assert.equal(showUi, false);
    assert.equal(window.getSelection().toString(), 'old');
    editor.textContent = text;
    return true;
  };
  assert.equal(adapter.replaceEditorText(editor, 'new'), true);
  assert.equal(document.activeElement, editor);
  assert.deepEqual(events, [['input', 'insertText', 'new'], ['change']]);
});

test('execCommand native input is not duplicated and change is emitted once', () => {
  const { dom, adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">old</div></form>');
  const editor = adapter.findEditor();
  const events = [];
  editor.addEventListener('input', () => events.push('input'));
  editor.addEventListener('change', () => events.push('change'));
  document.execCommand = (_command, _showUi, text) => {
    editor.textContent = text;
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  };
  assert.equal(adapter.replaceEditorText(editor, 'new'), true);
  assert.deepEqual(events, ['input', 'change']);
});

test('fake exec success with unchanged text returns false without events or DOM fallback', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">old</div></form>');
  const editor = adapter.findEditor();
  const events = [];
  editor.addEventListener('input', () => events.push('input'));
  editor.addEventListener('change', () => events.push('change'));
  document.execCommand = () => true;
  assert.equal(adapter.replaceEditorText(editor, 'new'), false);
  assert.equal(editor.textContent, 'old');
  assert.deepEqual(events, []);
});

test('execCommand can reliably write multiline text without DOM construction fallback', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">old</div></form>');
  const editor = adapter.findEditor();
  document.execCommand = (_command, _showUi, text) => { editor.textContent = text; return true; };
  assert.equal(adapter.replaceEditorText(editor, 'line one\nline two'), true);
  assert.equal(editor.textContent, 'line one\nline two');
});

test('replaceEditorText fails safely for missing editor and selection errors', () => {
  const { adapter } = loadAdapter('<form data-type="unified-composer"><div id="prompt-textarea" contenteditable="true">old</div></form>');
  assert.equal(adapter.replaceEditorText(null, 'new'), false);
  const editor = adapter.findEditor();
  window.getSelection = () => { throw new Error('selection unavailable'); };
  assert.doesNotThrow(() => adapter.replaceEditorText(editor, 'new'));
  assert.equal(adapter.replaceEditorText(editor, 'new'), false);
  assert.equal(editor.textContent, 'old');
});

test('starts the shared runtime outside test mode', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://chatgpt.com/' });
  activeDoms.add(dom);
  global.window = dom.window;
  global.document = dom.window.document;
  let receivedAdapter;
  let starts = 0;
  global.KCP = { createContentRuntime(adapter) { receivedAdapter = adapter; return { start() { starts += 1; } }; } };
  delete global.__KCP_TEST__;
  delete require.cache[require.resolve('../src/sites/chatgpt.js')];
  require('../src/sites/chatgpt.js');
  assert.equal(receivedAdapter.id, 'chatgpt');
  assert.equal(starts, 1);
});

function loadRuntime(loadSettings) {
  const dom = new JSDOM(`
    <form data-type="unified-composer">
      <div id="prompt-textarea" contenteditable="true">question</div>
      <button data-testid="send-button" type="button"><span>send</span></button>
    </form>
  `, { url: 'https://chatgpt.com/' });
  activeDoms.add(dom);
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.chrome = undefined;
  global.KCP = {};
  global.__KCP_TEST__ = true;
  for (const file of [
    '../src/shared/defaults.js', '../src/shared/prompt.js', '../src/shared/storage.js',
    '../src/shared/sites.js', '../src/content/runtime.js', '../src/sites/chatgpt.js'
  ]) {
    delete require.cache[require.resolve(file)];
    require(file);
  }
  global.KCP.loadSettings = loadSettings || (() => Promise.resolve(global.KCP.normalizeSettings({})));
  const adapter = global.KCP.createChatGPTAdapter();
  const runtime = global.KCP.createContentRuntime(adapter);
  return { dom, adapter, runtime, editor: adapter.findEditor() };
}

test('real runtime waits for storage then wraps Enter once before later handlers', async () => {
  let resolveSettings;
  const settings = new Promise((resolve) => { resolveSettings = resolve; });
  const { dom, runtime, editor } = loadRuntime(() => settings);
  let replacements = 0;
  document.execCommand = (_command, _showUi, text) => { replacements += 1; editor.textContent = text; return true; };
  runtime.start();
  const seen = [];
  document.addEventListener('keydown', () => seen.push(editor.textContent));
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(seen, ['question']);
  assert.equal(replacements, 0);

  resolveSettings({
    enabled: true,
    templates: [{ id: 'custom', title: 'Custom', body: 'ChatGPT custom' }],
    activeTemplateId: 'custom'
  });
  await Promise.resolve();
  await Promise.resolve();
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const expected = global.KCP.wrapPrompt('ChatGPT custom', 'question');
  assert.deepEqual(seen, ['question', expected]);
  assert.equal(replacements, 1);
});

test('real runtime wraps send click once and leaves Shift+Enter and composing Enter unchanged', async () => {
  const { dom, runtime, editor } = loadRuntime();
  let replacements = 0;
  document.execCommand = (_command, _showUi, text) => { replacements += 1; editor.textContent = text; return true; };
  runtime.start();
  await Promise.resolve();
  await Promise.resolve();
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  assert.equal(editor.textContent, 'question');
  assert.equal(replacements, 0);
  const seen = [];
  document.querySelector('[data-testid=send-button]').addEventListener('click', () => seen.push(editor.textContent));
  document.querySelector('[data-testid=send-button] span').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.match(seen[0], /用户输入：question$/);
  assert.equal(replacements, 1);
});
