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
  assert.equal(settings.enabled, true);
});

test('normalizeSettings selects first template when active template is missing', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{ id: 'custom', title: 'Custom', body: 'Body' }],
    activeTemplateId: 'missing'
  });
  assert.equal(settings.activeTemplateId, 'custom');
});

test('normalizeSettings ignores invalid template entries and keeps valid active id', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [null, { id: 'valid', title: 'Valid', body: 'Body' }],
    activeTemplateId: 'valid'
  });
  assert.deepEqual(settings.templates, [{ id: 'valid', title: 'Valid', body: 'Body' }]);
  assert.equal(settings.activeTemplateId, 'valid');
});

test('saveSettings writes normalized templates and active id', async () => {
  const { KCP, state } = loadStorageWithFakeChrome();
  await KCP.saveSettings({
    templates: [{ id: 'x', title: 'X', body: 'Body' }],
    activeTemplateId: 'x',
    enabled: false
  });
  assert.equal(state.templates[0].id, 'x');
  assert.equal(state.activeTemplateId, 'x');
  assert.equal(state.enabled, false);
});
