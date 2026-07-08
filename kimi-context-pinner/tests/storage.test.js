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
  assert.deepEqual(settings.templates, [{ id: 'valid', title: 'Valid', body: 'Body', skills: [] }]);
  assert.equal(settings.activeTemplateId, 'valid');
});

test('normalizeSettings adds empty skills to old templates', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{ id: 'legacy', title: 'Legacy', body: 'Body' }],
    activeTemplateId: 'legacy'
  });
  assert.deepEqual(settings.templates[0].skills, []);
});

test('normalizeSettings preserves valid skills and filters invalid entries', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{
      id: 'with-skills',
      title: 'With skills',
      body: 'Body',
      skills: [
        { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: false },
        { id: '', name: 'Missing id', content: 'Bad', enabled: true },
        null,
        { id: 'skill-b', name: '', content: 'Content B' }
      ]
    }],
    activeTemplateId: 'with-skills'
  });
  assert.deepEqual(settings.templates[0].skills, [
    { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: false },
    { id: 'skill-b', name: '未命名 Skill', content: 'Content B', enabled: true }
  ]);
});

test('normalizeSettings trims skill names and falls back for whitespace names', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{
      id: 'skills',
      title: 'Skills',
      body: 'Body',
      skills: [
        { id: 'trimmed', name: '  Trimmed Skill  ', content: 'Content' },
        { id: 'blank', name: '   ', content: 'Content' }
      ]
    }],
    activeTemplateId: 'skills'
  });
  assert.deepEqual(settings.templates[0].skills.map((skill) => skill.name), ['Trimmed Skill', '未命名 Skill']);
});

test('cloneTemplateForDuplicate creates independent skill ids', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const duplicate = KCP.cloneTemplateForDuplicate({
    id: 'source',
    title: 'Source',
    body: 'Body',
    skills: [
      { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: true }
    ]
  }, 'copy', () => 'new-skill-id');

  assert.equal(duplicate.id, 'copy');
  assert.equal(duplicate.title, 'Source 副本');
  assert.deepEqual(duplicate.skills, [
    { id: 'new-skill-id', name: 'Skill A', content: 'Content A', enabled: true }
  ]);
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
