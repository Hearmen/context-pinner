const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const popupSource = fs.readFileSync('src/popup/popup.js', 'utf8');
const popupHtml = fs.readFileSync('src/popup/popup.html', 'utf8');

const initialSettings = {
  templates: [
    { id: 'one', title: 'One', body: 'First' },
    { id: 'two', title: 'Two', body: 'Second' }
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
