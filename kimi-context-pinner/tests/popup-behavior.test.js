const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const popupSource = fs.readFileSync('src/popup/popup.js', 'utf8');
const popupHtml = fs.readFileSync('src/popup/popup.html', 'utf8');
const sitesSource = fs.readFileSync('src/shared/sites.js', 'utf8');
const activeTabSource = fs.readFileSync('src/popup/active-tab.js', 'utf8');

const initialSettings = {
  templates: [
    {
      id: 'one',
      title: 'One',
      body: 'First',
      skills: [{ id: 'skill-one', name: 'Existing Skill', content: 'Existing content', enabled: true }]
    },
    { id: 'two', title: 'Two', body: 'Second', skills: [] }
  ],
  activeTemplateId: 'one',
  enabled: true
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('condition was not reached');
}

async function createPopup({ saveSettings, refreshActiveSupportedTab }) {
  const dom = new JSDOM(popupHtml, { runScripts: 'outside-only' });
  const calls = { loads: 0, saves: [], refreshes: 0 };
  dom.window.KCP = {
    normalizeSettings: clone,
    async loadSettings() {
      calls.loads += 1;
      return clone(initialSettings);
    },
    async saveSettings(settings) {
      calls.saves.push(clone(settings));
      return saveSettings ? saveSettings(settings) : clone(settings);
    },
    async refreshActiveSupportedTab() {
      calls.refreshes += 1;
      return refreshActiveSupportedTab ? refreshActiveSupportedTab() : true;
    }
  };
  dom.window.eval(popupSource);
  await waitUntil(() => !dom.window.document.getElementById('enabledToggle').disabled);
  return { dom, calls };
}

function change(window, element) {
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

test('toggle refreshes only after its save succeeds', async (t) => {
  const save = deferred();
  const { dom, calls } = await createPopup({ saveSettings: () => save.promise });
  t.after(() => dom.window.close());
  const toggle = dom.window.document.getElementById('enabledToggle');
  toggle.checked = false;
  change(dom.window, toggle);

  await waitUntil(() => calls.saves.length === 1);
  assert.equal(calls.refreshes, 0);
  save.resolve(clone(calls.saves[0]));
  await waitUntil(() => calls.refreshes === 1);
});

test('toggle save reloads the current ChatGPT tab through the real site registry', async (t) => {
  const dom = new JSDOM(popupHtml, { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const calls = { saves: [], reloads: [] };
  dom.window.chrome = {
    runtime: {},
    tabs: {
      query(_queryInfo, callback) {
        callback([{ id: 84, url: 'https://chatgpt.com/c/abc' }]);
      },
      reload(tabId, callback) {
        calls.reloads.push(tabId);
        callback();
      }
    }
  };
  dom.window.KCP = {
    normalizeSettings: clone,
    async loadSettings() { return clone(initialSettings); },
    async saveSettings(settings) {
      calls.saves.push(clone(settings));
      return clone(settings);
    }
  };
  dom.window.eval(sitesSource);
  dom.window.eval(activeTabSource);
  dom.window.eval(popupSource);
  await waitUntil(() => !dom.window.document.getElementById('enabledToggle').disabled);

  const toggle = dom.window.document.getElementById('enabledToggle');
  toggle.checked = false;
  change(dom.window, toggle);

  await waitUntil(() => calls.reloads.length === 1);
  assert.equal(calls.saves[0].enabled, false);
  assert.deepEqual(calls.reloads, [84]);
});

test('failed toggle save does not refresh and restores persisted settings', async (t) => {
  const save = deferred();
  const { dom, calls } = await createPopup({ saveSettings: () => save.promise });
  t.after(() => dom.window.close());
  const toggle = dom.window.document.getElementById('enabledToggle');
  toggle.checked = false;
  change(dom.window, toggle);
  await waitUntil(() => calls.saves.length === 1);
  save.reject(new Error('save failed'));

  await waitUntil(() => calls.loads === 2 && !toggle.disabled);
  assert.equal(calls.refreshes, 0);
  assert.equal(toggle.checked, true);
});

test('failed refresh keeps the saved toggle and restores controls', async (t) => {
  const { dom, calls } = await createPopup({
    refreshActiveSupportedTab: async () => { throw new Error('reload failed'); }
  });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const toggle = document.getElementById('enabledToggle');
  toggle.checked = false;
  change(dom.window, toggle);

  await waitUntil(() => document.getElementById('status').textContent === '刷新失败' && !toggle.disabled);
  assert.equal(calls.loads, 1);
  assert.equal(calls.saves[0].enabled, false);
  assert.equal(toggle.checked, false);
  assert.equal(document.getElementById('saveButton').disabled, false);
});

test('non-toggle popup actions never refresh the active tab', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;

  document.getElementById('saveButton').click();
  await waitUntil(() => calls.saves.length === 1 && !document.getElementById('saveButton').disabled);

  const select = document.getElementById('templateSelect');
  select.value = 'two';
  change(dom.window, select);
  await waitUntil(() => calls.saves.length === 2 && !select.disabled);

  for (const [id, expectedSaves] of [['addButton', 3], ['duplicateButton', 4], ['deleteButton', 5]]) {
    document.getElementById(id).click();
    await waitUntil(() => calls.saves.length === expectedSaves && !document.getElementById(id).disabled);
  }

  assert.equal(calls.refreshes, 0);
});

test('popup renders skills and toggles skill enabled state', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const checkbox = document.querySelector('[data-skill-enabled="skill-one"]');

  assert.ok(checkbox);
  assert.equal(checkbox.checked, true);

  checkbox.checked = false;
  change(dom.window, checkbox);

  await waitUntil(() => calls.saves.length === 1);
  assert.equal(calls.saves[0].templates[0].skills[0].enabled, false);
});

test('popup expands skill editor, saves edits, and collapses', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const editor = document.getElementById('skillEditor');

  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));

  assert.equal(editor.hidden, false);
  assert.equal(document.getElementById('skillNameInput').value, 'Existing Skill');
  assert.equal(document.getElementById('skillContentInput').value, 'Existing content');

  document.getElementById('skillNameInput').value = 'Updated Skill';
  document.getElementById('skillContentInput').value = 'Updated content';
  click(dom.window, document.getElementById('skillDoneButton'));

  await waitUntil(() => calls.saves.length === 1 && editor.hidden);
  assert.equal(calls.saves[0].templates[0].skills[0].name, 'Updated Skill');
  assert.equal(calls.saves[0].templates[0].skills[0].content, 'Updated content');
});

test('main save persists the open skill editor before saving settings', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;

  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));
  document.getElementById('skillNameInput').value = 'Main Saved Skill';
  document.getElementById('skillContentInput').value = 'Main saved content';
  click(dom.window, document.getElementById('saveButton'));

  await waitUntil(() => calls.saves.length === 1);
  assert.equal(calls.saves[0].templates[0].skills[0].name, 'Main Saved Skill');
  assert.equal(calls.saves[0].templates[0].skills[0].content, 'Main saved content');
});

test('popup deletes a skill from the current template', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const editor = document.getElementById('skillEditor');

  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));
  click(dom.window, document.getElementById('skillDeleteButton'));

  await waitUntil(() => calls.saves.length === 1 && editor.hidden);
  assert.deepEqual(calls.saves[0].templates[0].skills, []);
});

test('switching templates refreshes skills list and collapses editor', async (t) => {
  const { dom } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const editor = document.getElementById('skillEditor');

  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));
  assert.equal(editor.hidden, false);

  const select = document.getElementById('templateSelect');
  select.value = 'two';
  change(dom.window, select);

  await waitUntil(() => editor.hidden && !document.querySelector('[data-skill-enabled="skill-one"]'));
  assert.equal(document.querySelector('[data-skill-enabled="skill-one"]'), null);
});

test('popup imports a skill file into the current template', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const input = document.getElementById('skillFileInput');
  const content = '---\nname: imported-skill\n---\nBody';
  const file = new dom.window.File([content], 'SKILL.md', { type: 'text/markdown' });
  if (typeof file.text !== 'function') {
    file.text = async () => content;
  }

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file]
  });
  change(dom.window, input);

  await waitUntil(() => calls.saves.length === 1);
  const imported = calls.saves[0].templates[0].skills[1];
  assert.equal(imported.name, 'imported-skill');
  assert.match(imported.content, /Body/);
  assert.equal(imported.enabled, true);
  assert.equal(Object.hasOwn(imported, 'fileName'), false);
  assert.equal(Object.hasOwn(imported, 'path'), false);
  assert.equal(input.value, '');
});

test('popup imports a slow skill file into the template selected at file selection time', async (t) => {
  const fileRead = deferred();
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const input = document.getElementById('skillFileInput');
  const file = { text: () => fileRead.promise };

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file]
  });
  change(dom.window, input);

  const select = document.getElementById('templateSelect');
  select.value = 'two';
  change(dom.window, select);
  await waitUntil(() => calls.saves.length === 1);

  fileRead.resolve('---\nname: slow-skill\n---\nBody');

  await waitUntil(() => calls.saves.length === 2);
  assert.equal(calls.saves[1].templates[0].skills.at(-1).name, 'slow-skill');
  assert.deepEqual(calls.saves[1].templates[1].skills, []);
});

test('popup reports an import attempted while another save is active', async (t) => {
  const save = deferred();
  const { dom, calls } = await createPopup({ saveSettings: () => save.promise });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const input = document.getElementById('skillFileInput');
  const file = { text: async () => '---\nname: blocked-skill\n---\nBody' };

  click(dom.window, document.getElementById('saveButton'));
  await waitUntil(() => calls.saves.length === 1);

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file]
  });
  change(dom.window, input);

  await waitUntil(() => document.getElementById('status').textContent === '正在保存，请稍后再导入 Skill');
  assert.equal(calls.saves.length, 1);

  save.resolve(clone(calls.saves[0]));
});
