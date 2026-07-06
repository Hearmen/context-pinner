const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadContent(html) {
  const dom = new JSDOM(html, { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  globalThis.KCP = {};
  globalThis.chrome = undefined;
  globalThis.__KCP_TEST__ = true;

  delete require.cache[require.resolve('../src/shared/sites.js')];
  delete require.cache[require.resolve('../src/shared/defaults.js')];
  delete require.cache[require.resolve('../src/shared/prompt.js')];
  delete require.cache[require.resolve('../src/shared/storage.js')];
  delete require.cache[require.resolve('../src/content/indicator.js')];
  delete require.cache[require.resolve('../src/content/content.js')];

  require('../src/shared/sites.js');
  require('../src/shared/defaults.js');
  require('../src/shared/prompt.js');
  require('../src/shared/storage.js');
  require('../src/content/indicator.js');
  require('../src/content/content.js');

  return { dom, KCP: globalThis.KCP };
}

function loadPageBridge(html) {
  const dom = new JSDOM(html, { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  globalThis.__KCP_TEST__ = true;

  delete require.cache[require.resolve('../src/content/page-bridge.js')];
  require('../src/content/page-bridge.js');

  return { dom };
}

test('findEditor locates Kimi contenteditable editor', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">hello</div>');
  assert.equal(KCP.findEditor().innerText, 'hello');
});

test('findSendButton locates send button container from send icon', () => {
  const { KCP } = loadContent('<div class="chat-editor"><div class="send-button-container"><svg class="send-icon"></svg></div></div>');
  assert.equal(KCP.findSendButton().className, 'send-button-container');
});

test('refreshActiveTemplate shows the Kimi enabled indicator when enabled', async () => {
  const { KCP } = loadContent('<body></body>');
  const calls = [];
  KCP.loadSettings = () => Promise.resolve({
    enabled: true,
    templates: [{ id: 'template', title: 'Template', body: 'Template body' }],
    activeTemplateId: 'template'
  });
  KCP.syncEnabledIndicator = (...args) => calls.push(args);

  await KCP.refreshActiveTemplate();

  assert.deepEqual(calls, [[true, KCP.SUPPORTED_SITES[0].indicatorText]]);
});

test('refreshActiveTemplate hides the Kimi enabled indicator when disabled', async () => {
  const { KCP } = loadContent('<body></body>');
  const calls = [];
  KCP.loadSettings = () => Promise.resolve({
    enabled: false,
    templates: [{ id: 'template', title: 'Template', body: 'Template body' }],
    activeTemplateId: 'template'
  });
  KCP.syncEnabledIndicator = (...args) => calls.push(args);

  await KCP.refreshActiveTemplate();

  assert.deepEqual(calls, [[false, KCP.SUPPORTED_SITES[0].indicatorText]]);
});

test('startContentScript creates the enabled indicator when body appears after settings load', async () => {
  const { dom, KCP } = loadContent('<html><head></head><body></body></html>');
  document.body.remove();
  KCP.loadSettings = () => Promise.resolve({
    enabled: true,
    templates: [{ id: 'template', title: 'Template', body: 'Template body' }],
    activeTemplateId: 'template'
  });

  KCP.startContentScript();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(document.getElementById('kcp-enabled-indicator'), null);

  const body = document.createElement('body');
  document.documentElement.appendChild(body);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(document.getElementById('kcp-enabled-indicator').textContent, '● Context 已开启');
});

test('refreshActiveTemplate ignores an older request that resolves after a newer request', async () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">question</div>');
  const pending = [];
  const indicatorCalls = [];
  KCP.loadSettings = () => new Promise((resolve) => pending.push(resolve));
  KCP.syncEnabledIndicator = (...args) => indicatorCalls.push(args);

  const olderRefresh = KCP.refreshActiveTemplate();
  const newerRefresh = KCP.refreshActiveTemplate();
  pending[1]({
    enabled: true,
    templates: [{ id: 'new', title: 'New', body: 'New template' }],
    activeTemplateId: 'new'
  });
  await newerRefresh;
  pending[0]({
    enabled: false,
    templates: [{ id: 'old', title: 'Old', body: 'Old template' }],
    activeTemplateId: 'old'
  });
  await olderRefresh;

  assert.deepEqual(indicatorCalls, [[true, KCP.SUPPORTED_SITES[0].indicatorText]]);
  assert.equal(KCP.wrapCurrentEditorInput(), true);
  assert.match(KCP.findEditor().textContent, /New template/);
  assert.doesNotMatch(KCP.findEditor().textContent, /Old template/);
});

test('storage changes refresh only relevant sync settings', async () => {
  const { KCP } = loadContent('<body></body>');
  let storageListener;
  let loadCount = 0;
  globalThis.chrome = {
    storage: {
      onChanged: {
        addListener(listener) {
          storageListener = listener;
        }
      }
    }
  };
  KCP.loadSettings = () => {
    loadCount += 1;
    return Promise.resolve({
      enabled: true,
      templates: [{ id: 'template', title: 'Template', body: 'Template body' }],
      activeTemplateId: 'template'
    });
  };
  KCP.syncEnabledIndicator = () => null;

  KCP.startContentScript();
  await Promise.resolve();
  assert.equal(loadCount, 1);

  storageListener({ enabled: { newValue: false } }, 'local');
  storageListener({ unrelated: { newValue: true } }, 'sync');
  await Promise.resolve();
  assert.equal(loadCount, 1);

  storageListener({ enabled: { newValue: false } }, 'sync');
  storageListener({ templates: { newValue: [] } });
  await Promise.resolve();
  assert.equal(loadCount, 3);
});

test('replaceEditorText updates editor text and dispatches input event', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = KCP.findEditor();
  let inputCount = 0;
  editor.addEventListener('input', () => inputCount += 1);
  KCP.replaceEditorText(editor, 'new');
  assert.equal(editor.textContent, 'new');
  assert.equal(inputCount, 1);
});

test('replaceEditorText falls back when execCommand reports success without changing text', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = KCP.findEditor();
  document.execCommand = () => true;

  KCP.replaceEditorText(editor, 'new');

  assert.equal(editor.textContent, 'new');
});

test('replaceEditorText uses Lexical editor state when available', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = KCP.findEditor();
  let currentText = 'old';
  let execCommandCalled = false;

  Object.defineProperty(editor, 'textContent', {
    configurable: true,
    get() {
      return currentText;
    },
    set() {}
  });
  Object.defineProperty(editor, 'innerText', {
    configurable: true,
    get() {
      return currentText;
    },
    set() {}
  });

  editor.__lexicalEditor = {
    parseEditorState(serialized) {
      return JSON.parse(serialized);
    },
    setEditorState(state) {
      currentText = state.root.children[0].children[0].text;
    }
  };
  document.execCommand = () => {
    execCommandCalled = true;
    currentText = 'corrupt partial insert';
    return true;
  };

  KCP.replaceEditorText(editor, 'new exact text');

  assert.equal(currentText, 'new exact text');
  assert.equal(execCommandCalled, false);
});

test('replaceEditorText does not fall through to execCommand when Lexical DOM sync is delayed', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = KCP.findEditor();
  let lexicalText = 'old';
  let execCommandCalled = false;

  editor.__lexicalEditor = {
    parseEditorState(serialized) {
      return JSON.parse(serialized);
    },
    setEditorState(state) {
      lexicalText = state.root.children[0].children[0].text;
    }
  };
  document.execCommand = () => {
    execCommandCalled = true;
    return true;
  };

  KCP.replaceEditorText(editor, 'new exact text');

  assert.equal(lexicalText, 'new exact text');
  assert.equal(execCommandCalled, false);
});

test('page bridge replaces Lexical editor state from a DOM event', () => {
  loadPageBridge('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = document.querySelector('.chat-input-editor');
  let lexicalText = 'old';

  editor.__lexicalEditor = {
    parseEditorState(serialized) {
      return JSON.parse(serialized);
    },
    setEditorState(state) {
      lexicalText = state.root.children[0].children[0].text;
    }
  };

  document.dispatchEvent(new window.CustomEvent('kcp:set-editor-text', {
    detail: JSON.stringify({ nonce: 'n1', text: 'new exact text' })
  }));

  assert.equal(lexicalText, 'new exact text');
  assert.equal(document.documentElement.getAttribute('data-kcp-page-replace-result'), 'n1:true');
});

test('replaceEditorText does not fall through when page bridge reports success', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = KCP.findEditor();
  let bridgeText = '';
  let execCommandCalled = false;

  document.addEventListener('kcp:set-editor-text', (event) => {
    const payload = JSON.parse(event.detail);
    bridgeText = payload.text;
    document.documentElement.setAttribute('data-kcp-page-replace-result', `${payload.nonce}:true`);
  }, true);
  document.execCommand = () => {
    execCommandCalled = true;
    return true;
  };

  KCP.replaceEditorText(editor, 'new exact text');

  assert.equal(bridgeText, 'new exact text');
  assert.equal(execCommandCalled, false);
});

test('Enter binding wraps editor text before later same-event handlers read it', () => {
  const { dom, KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">question</div>');
  const editor = KCP.findEditor();
  let seenByKimiHandler = '';

  if (KCP.setCachedTemplateBodyForTest) {
    KCP.setCachedTemplateBodyForTest('Template body');
  } else {
    KCP.loadSettings = () => Promise.resolve({
      templates: [{ id: 'template', title: 'Template', body: 'Template body' }],
      activeTemplateId: 'template'
    });
  }

  KCP.bindKimiDom();
  editor.addEventListener('keydown', () => {
    seenByKimiHandler = editor.textContent;
  });

  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true
  }));

  assert.match(seenByKimiHandler, /^请按以下上下文处理用户输入。上下文模板：/);
  assert.match(seenByKimiHandler, /Template body/);
  assert.match(seenByKimiHandler, /question/);
});

test('document capture wraps click before earlier target capture handlers read it', () => {
  const { dom, KCP } = loadContent(`
    <div class="chat-editor">
      <div class="chat-input-editor" contenteditable="true" role="textbox">question</div>
      <div class="send-button-container"><svg class="send-icon"></svg></div>
    </div>
  `);
  const editor = KCP.findEditor();
  const button = KCP.findSendButton();
  let seenByKimiHandler = '';

  button.addEventListener('click', () => {
    seenByKimiHandler = editor.textContent;
  }, true);

  KCP.setCachedTemplateBodyForTest('Template body');
  KCP.startContentScript();

  button.dispatchEvent(new dom.window.MouseEvent('click', {
    bubbles: true
  }));

  assert.match(seenByKimiHandler, /^请按以下上下文处理用户输入。上下文模板：/);
  assert.match(seenByKimiHandler, /Template body/);
  assert.match(seenByKimiHandler, /question/);
});

test('document capture and target binding do not double wrap the same click', () => {
  const { dom, KCP } = loadContent(`
    <div class="chat-editor">
      <div class="chat-input-editor" contenteditable="true" role="textbox">question</div>
      <div class="send-button-container"><svg class="send-icon"></svg></div>
    </div>
  `);
  const editor = KCP.findEditor();
  const button = KCP.findSendButton();

  KCP.setCachedTemplateBodyForTest('Template body');
  KCP.startContentScript();

  button.dispatchEvent(new dom.window.MouseEvent('click', {
    bubbles: true
  }));

  assert.equal(
    editor.textContent,
    '请按以下上下文处理用户输入。上下文模板：Template body用户输入：question'
  );
});

test('Enter binding leaves editor unchanged when injection is disabled', () => {
  const { dom, KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">question</div>');
  const editor = KCP.findEditor();

  KCP.setCachedTemplateBodyForTest('Template body');
  KCP.setEnabledForTest(false);
  KCP.bindKimiDom();

  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true
  }));

  assert.equal(editor.textContent, 'question');
});

test('startContentScript wraps immediate Enter with default template before storage resolves', () => {
  const { dom, KCP } = loadContent('<html><body><div class="chat-input-editor" contenteditable="true" role="textbox">question</div></body></html>');
  const editor = KCP.findEditor();
  KCP.loadSettings = () => new Promise(() => {});

  KCP.startContentScript();
  editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true
  }));

  assert.match(editor.textContent, /^请按以下上下文处理用户输入。上下文模板：/);
  assert.ok(editor.textContent.includes(KCP.DEFAULT_TEMPLATES[0].body));
  assert.match(editor.textContent, /question/);
});
