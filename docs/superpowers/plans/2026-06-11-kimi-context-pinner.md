# Kimi Context Pinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loadable Chrome MV3 extension that prepends a selected editable context template to every Kimi message on `https://www.kimi.com/`.

**Architecture:** Use a no-build extension under `kimi-context-pinner/`. Shared scripts attach helpers to `globalThis.KCP` so the manifest can load them before the content script and popup scripts can reuse them directly. Tests run with Node's built-in test runner plus `jsdom` for light DOM behavior.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, HTML/CSS, `chrome.storage.sync`, Node `node:test`, `jsdom`.

---

## File Structure

- Create `kimi-context-pinner/manifest.json`: MV3 extension manifest.
- Create `kimi-context-pinner/package.json`: test scripts and dev dependency.
- Create `kimi-context-pinner/src/shared/defaults.js`: storage keys and built-in templates.
- Create `kimi-context-pinner/src/shared/prompt.js`: prompt wrapping and duplicate detection.
- Create `kimi-context-pinner/src/shared/storage.js`: Chrome storage helpers and normalization.
- Create `kimi-context-pinner/src/content/content.js`: Kimi DOM detection, editor update, and send interception.
- Create `kimi-context-pinner/src/popup/popup.html`: extension popup UI.
- Create `kimi-context-pinner/src/popup/popup.css`: compact popup styling.
- Create `kimi-context-pinner/src/popup/popup.js`: template selection and editing behavior.
- Create `kimi-context-pinner/tests/prompt.test.js`: prompt helper tests.
- Create `kimi-context-pinner/tests/storage.test.js`: storage helper tests with a fake Chrome storage API.
- Create `kimi-context-pinner/tests/content-dom.test.js`: DOM selector and editor replacement tests.
- Create `kimi-context-pinner/README.md`: load and verify instructions.

## Task 1: Project Skeleton

**Files:**
- Create: `kimi-context-pinner/package.json`
- Create: `kimi-context-pinner/manifest.json`
- Create: `kimi-context-pinner/README.md`

- [ ] **Step 1: Create extension package metadata**

Create `kimi-context-pinner/package.json`:

```json
{
  "name": "kimi-context-pinner",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests/*.test.js"
  },
  "devDependencies": {
    "jsdom": "^24.1.3"
  }
}
```

- [ ] **Step 2: Create MV3 manifest**

Create `kimi-context-pinner/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Kimi Context Pinner",
  "version": "0.1.0",
  "description": "Prepends editable context templates to Kimi messages before sending.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.kimi.com/*"],
  "action": {
    "default_title": "Kimi Context Pinner",
    "default_popup": "src/popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.kimi.com/*"],
      "js": [
        "src/shared/defaults.js",
        "src/shared/prompt.js",
        "src/shared/storage.js",
        "src/content/content.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 3: Create README**

Create `kimi-context-pinner/README.md`:

```markdown
# Kimi Context Pinner

Chrome MV3 extension for `https://www.kimi.com/`.

## Develop

```bash
npm install
npm test
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `kimi-context-pinner` directory.
5. Open `https://www.kimi.com/`.
6. Choose or edit a template from the extension popup.

The active template is prepended to messages when clicking Kimi's send button or pressing Enter. Shift+Enter remains a newline.
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
cd kimi-context-pinner
npm install
```

Expected: `package-lock.json` is created and install exits with status `0`.

- [ ] **Step 5: Run tests before test files exist**

Run:

```bash
cd kimi-context-pinner
npm test
```

Expected: FAIL or no test files found. This confirms the skeleton exists before behavior is implemented.

## Task 2: Prompt Wrapping Helpers

**Files:**
- Create: `kimi-context-pinner/tests/prompt.test.js`
- Create: `kimi-context-pinner/src/shared/defaults.js`
- Create: `kimi-context-pinner/src/shared/prompt.js`

- [ ] **Step 1: Write failing prompt tests**

Create `kimi-context-pinner/tests/prompt.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.KCP = {};
require('../src/shared/defaults.js');
require('../src/shared/prompt.js');

test('wrapPrompt prepends template body to original input', () => {
  const result = globalThis.KCP.wrapPrompt('Translate both ways.', '你好');
  assert.equal(result, '[Kimi Context Pinner]\nTranslate both ways.\n\n用户输入：\n你好');
});

test('wrapPrompt returns original input when template is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('   ', 'hello'), 'hello');
});

test('wrapPrompt returns original input when input is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', '   '), '   ');
});

test('wrapPrompt does not double wrap marked input', () => {
  const wrapped = '[Kimi Context Pinner]\nTranslate.\n\n用户输入：\nhello';
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', wrapped), wrapped);
});
```

- [ ] **Step 2: Run prompt tests to verify RED**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/prompt.test.js
```

Expected: FAIL because `src/shared/defaults.js` and `src/shared/prompt.js` do not exist.

- [ ] **Step 3: Implement defaults and prompt helpers**

Create `kimi-context-pinner/src/shared/defaults.js`:

```js
(function attachDefaults(root) {
  const KCP = root.KCP || {};

  KCP.STORAGE_KEYS = {
    templates: 'templates',
    activeTemplateId: 'activeTemplateId'
  };

  KCP.DEFAULT_TEMPLATES = [
    {
      id: 'translate-bilingual',
      title: '双向翻译',
      body: '请判断我输入的语言：如果是中文，翻译成英文；如果是英文，翻译成中文。只输出译文，不要解释。'
    },
    {
      id: 'polish-english',
      title: '英文润色',
      body: '请将用户输入的英文润色为自然、清晰、专业的表达，保持原意。只输出润色后的英文。'
    },
    {
      id: 'summarize-notes',
      title: '摘要整理',
      body: '请将用户输入整理为简洁、结构化的摘要。保留关键事实、结论和行动项。'
    }
  ];

  root.KCP = KCP;
})(globalThis);
```

Create `kimi-context-pinner/src/shared/prompt.js`:

```js
(function attachPrompt(root) {
  const KCP = root.KCP || {};
  const MARKER = '[Kimi Context Pinner]';

  function isWrapped(input) {
    return typeof input === 'string' && input.trimStart().startsWith(MARKER);
  }

  function wrapPrompt(templateBody, originalInput) {
    if (typeof originalInput !== 'string' || originalInput.trim() === '') {
      return originalInput;
    }

    if (typeof templateBody !== 'string' || templateBody.trim() === '') {
      return originalInput;
    }

    if (isWrapped(originalInput)) {
      return originalInput;
    }

    return `${MARKER}\n${templateBody.trim()}\n\n用户输入：\n${originalInput}`;
  }

  KCP.PROMPT_MARKER = MARKER;
  KCP.isWrapped = isWrapped;
  KCP.wrapPrompt = wrapPrompt;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 4: Run prompt tests to verify GREEN**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/prompt.test.js
```

Expected: PASS.

## Task 3: Storage Helpers

**Files:**
- Create: `kimi-context-pinner/tests/storage.test.js`
- Create: `kimi-context-pinner/src/shared/storage.js`

- [ ] **Step 1: Write failing storage tests**

Create `kimi-context-pinner/tests/storage.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

function loadStorageWithFakeChrome(initial = {}) {
  delete require.cache[require.resolve('../src/shared/defaults.js')];
  delete require.cache[require.resolve('../src/shared/storage.js')];
  globalThis.KCP = {};

  const state = { ...initial };
  globalThis.chrome = {
    storage: {
      sync: {
        get(keys, callback) {
          const result = {};
          for (const key of keys) result[key] = state[key];
          callback(result);
        },
        set(values, callback) {
          Object.assign(state, values);
          if (callback) callback();
        }
      }
    },
    runtime: { lastError: null }
  };

  require('../src/shared/defaults.js');
  require('../src/shared/storage.js');
  return { KCP: globalThis.KCP, state };
}

test('loadSettings returns built-in templates when storage is empty', async () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = await KCP.loadSettings();
  assert.equal(settings.templates.length, 3);
  assert.equal(settings.activeTemplateId, 'translate-bilingual');
});

test('normalizeSettings selects first template when active template is missing', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{ id: 'custom', title: 'Custom', body: 'Body' }],
    activeTemplateId: 'missing'
  });
  assert.equal(settings.activeTemplateId, 'custom');
});

test('saveSettings writes normalized templates and active id', async () => {
  const { KCP, state } = loadStorageWithFakeChrome();
  await KCP.saveSettings({
    templates: [{ id: 'x', title: 'X', body: 'Body' }],
    activeTemplateId: 'x'
  });
  assert.equal(state.templates[0].id, 'x');
  assert.equal(state.activeTemplateId, 'x');
});
```

- [ ] **Step 2: Run storage tests to verify RED**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/storage.test.js
```

Expected: FAIL because `src/shared/storage.js` does not exist.

- [ ] **Step 3: Implement storage helpers**

Create `kimi-context-pinner/src/shared/storage.js`:

```js
(function attachStorage(root) {
  const KCP = root.KCP || {};

  function cloneTemplate(template) {
    return {
      id: String(template.id || ''),
      title: String(template.title || ''),
      body: String(template.body || '')
    };
  }

  function normalizeSettings(settings) {
    const inputTemplates = Array.isArray(settings && settings.templates)
      ? settings.templates
      : KCP.DEFAULT_TEMPLATES;

    const templates = inputTemplates
      .map(cloneTemplate)
      .filter((template) => template.id && template.title);

    const safeTemplates = templates.length > 0
      ? templates
      : KCP.DEFAULT_TEMPLATES.map(cloneTemplate);

    const requestedActiveId = settings && settings.activeTemplateId;
    const activeExists = safeTemplates.some((template) => template.id === requestedActiveId);

    return {
      templates: safeTemplates,
      activeTemplateId: activeExists ? requestedActiveId : safeTemplates[0].id
    };
  }

  function getChromeStorage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.sync;
  }

  function loadSettings() {
    const storage = getChromeStorage();
    if (!storage) {
      return Promise.resolve(normalizeSettings({}));
    }

    return new Promise((resolve) => {
      storage.get([KCP.STORAGE_KEYS.templates, KCP.STORAGE_KEYS.activeTemplateId], (items) => {
        if (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) {
          resolve(normalizeSettings({}));
          return;
        }

        resolve(normalizeSettings({
          templates: items[KCP.STORAGE_KEYS.templates],
          activeTemplateId: items[KCP.STORAGE_KEYS.activeTemplateId]
        }));
      });
    });
  }

  function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    const storage = getChromeStorage();
    if (!storage) {
      return Promise.resolve(normalized);
    }

    return new Promise((resolve, reject) => {
      storage.set({
        [KCP.STORAGE_KEYS.templates]: normalized.templates,
        [KCP.STORAGE_KEYS.activeTemplateId]: normalized.activeTemplateId
      }, () => {
        if (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) {
          reject(new Error(root.chrome.runtime.lastError.message));
          return;
        }
        resolve(normalized);
      });
    });
  }

  function getActiveTemplate(settings) {
    const normalized = normalizeSettings(settings);
    return normalized.templates.find((template) => template.id === normalized.activeTemplateId) || null;
  }

  KCP.normalizeSettings = normalizeSettings;
  KCP.loadSettings = loadSettings;
  KCP.saveSettings = saveSettings;
  KCP.getActiveTemplate = getActiveTemplate;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 4: Run storage tests to verify GREEN**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/storage.test.js
```

Expected: PASS.

## Task 4: Content Script DOM Helpers And Interception

**Files:**
- Create: `kimi-context-pinner/tests/content-dom.test.js`
- Create: `kimi-context-pinner/src/content/content.js`

- [ ] **Step 1: Write failing DOM tests**

Create `kimi-context-pinner/tests/content-dom.test.js`:

```js
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

  delete require.cache[require.resolve('../src/shared/defaults.js')];
  delete require.cache[require.resolve('../src/shared/prompt.js')];
  delete require.cache[require.resolve('../src/shared/storage.js')];
  delete require.cache[require.resolve('../src/content/content.js')];

  require('../src/shared/defaults.js');
  require('../src/shared/prompt.js');
  require('../src/shared/storage.js');
  require('../src/content/content.js');

  return { dom, KCP: globalThis.KCP };
}

test('findEditor locates Kimi contenteditable editor', () => {
  const { KCP } = loadContent('<div class="chat-input-editor" contenteditable="true" role="textbox">hello</div>');
  assert.equal(KCP.findEditor().innerText, 'hello');
});

test('findSendButton locates send button container from send icon', () => {
  const { KCP } = loadContent('<div class="chat-editor"><div class="send-button-container"><svg class="send-icon"></svg></div></div>');
  assert.equal(KCP.findSendButton().className, 'send-button-container');
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
```

- [ ] **Step 2: Run DOM tests to verify RED**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/content-dom.test.js
```

Expected: FAIL because `src/content/content.js` does not exist.

- [ ] **Step 3: Implement content script helpers and binding**

Create `kimi-context-pinner/src/content/content.js`:

```js
(function attachContent(root) {
  const KCP = root.KCP || {};
  const BOUND_ATTR = 'data-kcp-bound';

  function findEditor() {
    return document.querySelector('.chat-input-editor[contenteditable=true]')
      || document.querySelector('[role="textbox"][contenteditable=true]');
  }

  function findSendButton() {
    const icon = document.querySelector('.chat-editor .send-icon') || document.querySelector('.send-icon');
    if (!icon) return null;
    return icon.closest('.send-button-container') || icon.parentElement;
  }

  function selectEditorContents(editor) {
    const selection = root.getSelection && root.getSelection();
    if (!selection || !document.createRange) return false;
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function replaceEditorText(editor, text) {
    editor.focus();
    const selected = selectEditorContents(editor);
    let inserted = false;

    if (selected && document.execCommand) {
      inserted = document.execCommand('insertText', false, text);
    }

    if (!inserted) {
      editor.textContent = text;
    }

    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function wrapCurrentEditorInput() {
    const editor = findEditor();
    if (!editor) return false;

    const original = editor.innerText || editor.textContent || '';
    const settings = await KCP.loadSettings();
    const activeTemplate = KCP.getActiveTemplate(settings);
    if (!activeTemplate || !activeTemplate.body.trim()) return false;

    const wrapped = KCP.wrapPrompt(activeTemplate.body, original);
    if (wrapped === original) return false;

    replaceEditorText(editor, wrapped);
    return true;
  }

  function bindEditor(editor) {
    if (!editor || editor.getAttribute(BOUND_ATTR) === 'true') return;
    editor.setAttribute(BOUND_ATTR, 'true');
    editor.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      wrapCurrentEditorInput();
    }, true);
  }

  function bindSendButton(button) {
    if (!button || button.getAttribute(BOUND_ATTR) === 'true') return;
    button.setAttribute(BOUND_ATTR, 'true');
    button.addEventListener('click', () => {
      wrapCurrentEditorInput();
    }, true);
  }

  function bindKimiDom() {
    bindEditor(findEditor());
    bindSendButton(findSendButton());
  }

  function startContentScript() {
    bindKimiDom();
    const observer = new MutationObserver(() => bindKimiDom());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  KCP.findEditor = findEditor;
  KCP.findSendButton = findSendButton;
  KCP.replaceEditorText = replaceEditorText;
  KCP.wrapCurrentEditorInput = wrapCurrentEditorInput;
  KCP.bindKimiDom = bindKimiDom;
  KCP.startContentScript = startContentScript;
  root.KCP = KCP;

  if (document && document.documentElement && !root.__KCP_TEST__) {
    startContentScript();
  }
})(globalThis);
```

- [ ] **Step 4: Run DOM tests to verify GREEN**

Run:

```bash
cd kimi-context-pinner
npm test -- tests/content-dom.test.js
```

Expected: PASS.

## Task 5: Popup UI

**Files:**
- Create: `kimi-context-pinner/src/popup/popup.html`
- Create: `kimi-context-pinner/src/popup/popup.css`
- Create: `kimi-context-pinner/src/popup/popup.js`

- [ ] **Step 1: Create popup HTML**

Create `kimi-context-pinner/src/popup/popup.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Kimi Context Pinner</title>
    <link rel="stylesheet" href="./popup.css">
  </head>
  <body>
    <main class="app">
      <header class="header">
        <h1>Kimi Context</h1>
        <span id="status" class="status" aria-live="polite"></span>
      </header>

      <label class="field">
        <span>模板</span>
        <select id="templateSelect"></select>
      </label>

      <label class="field">
        <span>名称</span>
        <input id="templateTitle" type="text" autocomplete="off">
      </label>

      <label class="field">
        <span>内容</span>
        <textarea id="templateBody" rows="8"></textarea>
      </label>

      <div class="actions">
        <button id="saveButton" type="button">保存</button>
        <button id="addButton" type="button">新增</button>
        <button id="duplicateButton" type="button">复制</button>
        <button id="deleteButton" type="button">删除</button>
      </div>
    </main>

    <script src="../shared/defaults.js"></script>
    <script src="../shared/storage.js"></script>
    <script src="./popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create popup CSS**

Create `kimi-context-pinner/src/popup/popup.css`:

```css
:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-width: 340px;
  background: #f7f7f5;
  color: #1f2328;
}

.app {
  padding: 14px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.status {
  min-height: 16px;
  font-size: 12px;
  color: #57606a;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
}

select,
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  color: #1f2328;
  font: inherit;
  font-weight: 400;
}

select,
input {
  height: 34px;
  padding: 0 9px;
}

textarea {
  resize: vertical;
  min-height: 132px;
  padding: 9px;
  line-height: 1.45;
}

.actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

button {
  height: 32px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  color: #1f2328;
  font: inherit;
  cursor: pointer;
}

button:hover {
  background: #eef2f5;
}

#saveButton {
  background: #1f883d;
  border-color: #1f883d;
  color: #fff;
}
```

- [ ] **Step 3: Create popup JavaScript**

Create `kimi-context-pinner/src/popup/popup.js`:

```js
(function initPopup(root) {
  const KCP = root.KCP;
  const select = document.getElementById('templateSelect');
  const titleInput = document.getElementById('templateTitle');
  const bodyInput = document.getElementById('templateBody');
  const status = document.getElementById('status');
  const saveButton = document.getElementById('saveButton');
  const addButton = document.getElementById('addButton');
  const duplicateButton = document.getElementById('duplicateButton');
  const deleteButton = document.getElementById('deleteButton');

  let settings = null;

  function setStatus(message) {
    status.textContent = message;
    if (message) {
      setTimeout(() => {
        if (status.textContent === message) status.textContent = '';
      }, 1600);
    }
  }

  function createId() {
    return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function currentTemplate() {
    return settings.templates.find((template) => template.id === settings.activeTemplateId) || settings.templates[0];
  }

  function render() {
    select.textContent = '';
    for (const template of settings.templates) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.title;
      select.append(option);
    }
    select.value = settings.activeTemplateId;

    const template = currentTemplate();
    titleInput.value = template ? template.title : '';
    bodyInput.value = template ? template.body : '';
    deleteButton.disabled = settings.templates.length <= 1;
  }

  async function persist(message) {
    settings = await KCP.saveSettings(settings);
    render();
    setStatus(message);
  }

  function updateCurrentFromInputs() {
    const template = currentTemplate();
    if (!template) return;
    template.title = titleInput.value.trim() || '未命名模板';
    template.body = bodyInput.value;
  }

  select.addEventListener('change', async () => {
    updateCurrentFromInputs();
    settings.activeTemplateId = select.value;
    await persist('已切换');
  });

  saveButton.addEventListener('click', async () => {
    updateCurrentFromInputs();
    await persist('已保存');
  });

  addButton.addEventListener('click', async () => {
    updateCurrentFromInputs();
    const template = {
      id: createId(),
      title: '新模板',
      body: ''
    };
    settings.templates.push(template);
    settings.activeTemplateId = template.id;
    await persist('已新增');
  });

  duplicateButton.addEventListener('click', async () => {
    updateCurrentFromInputs();
    const source = currentTemplate();
    const template = {
      id: createId(),
      title: `${source.title} 副本`,
      body: source.body
    };
    settings.templates.push(template);
    settings.activeTemplateId = template.id;
    await persist('已复制');
  });

  deleteButton.addEventListener('click', async () => {
    const template = currentTemplate();
    settings.templates = settings.templates.filter((item) => item.id !== template.id);
    settings.activeTemplateId = settings.templates[0] ? settings.templates[0].id : '';
    await persist('已删除');
  });

  KCP.loadSettings()
    .then((loaded) => {
      settings = loaded;
      render();
    })
    .catch((error) => {
      settings = KCP.normalizeSettings({});
      render();
      setStatus(error.message || '加载失败');
    });
})(globalThis);
```

- [ ] **Step 4: Run all tests**

Run:

```bash
cd kimi-context-pinner
npm test
```

Expected: PASS for prompt, storage, and content DOM tests.

## Task 6: Manual Kimi Verification

**Files:**
- Modify only if verification exposes a defect: `kimi-context-pinner/src/content/content.js`
- Modify only if verification exposes a defect: `kimi-context-pinner/src/popup/popup.js`

- [ ] **Step 1: Load unpacked extension**

Open Chrome `chrome://extensions`, enable Developer mode, click Load unpacked, and select:

```text
/Users/hearmen/Project/AI4Sec/ai_generate/codex_wp/kimi-context-pinner
```

Expected: Chrome accepts the manifest and shows "Kimi Context Pinner".

- [ ] **Step 2: Verify popup behavior**

Open the extension popup.

Expected:

- The selector shows `双向翻译`, `英文润色`, and `摘要整理`.
- Editing a title or body and clicking `保存` persists after reopening the popup.
- `新增`, `复制`, and `删除` update the selector correctly.

- [ ] **Step 3: Verify Kimi send wrapping without sending sensitive content**

Open `https://www.kimi.com/`, choose a disposable chat, type:

```text
hello
```

Click the send button.

Expected: Before Kimi sends, the editor content becomes:

```text
[Kimi Context Pinner]
请判断我输入的语言：如果是中文，翻译成英文；如果是英文，翻译成中文。只输出译文，不要解释。

用户输入：
hello
```

- [ ] **Step 4: Verify Enter and Shift+Enter behavior**

Type:

```text
line one
```

Press Shift+Enter and confirm a newline is inserted. Then press Enter.

Expected: Shift+Enter does not wrap or send. Enter wraps once and sends.

- [ ] **Step 5: Run final automated tests**

Run:

```bash
cd kimi-context-pinner
npm test
```

Expected: PASS.

- [ ] **Step 6: Record git status limitation**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. Do not attempt to commit unless the workspace is initialized as a git repository.

## Self-Review

- Spec coverage: The plan implements the MV3 extension, popup template selection and editing, storage sync, Kimi page send interception, duplicate protection, quiet failure, and tests named in the design.
- Placeholder scan: No task depends on TBD, TODO, or "similar to previous task" language.
- Type consistency: Shared helper names are consistent across tests, popup, and content script: `KCP.wrapPrompt`, `KCP.loadSettings`, `KCP.saveSettings`, `KCP.normalizeSettings`, `KCP.getActiveTemplate`, `KCP.findEditor`, `KCP.findSendButton`, and `KCP.replaceEditorText`.
