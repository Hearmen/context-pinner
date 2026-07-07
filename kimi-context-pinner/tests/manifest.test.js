const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const isolatedScripts = [
  'src/shared/sites.js',
  'src/shared/defaults.js',
  'src/shared/prompt.js',
  'src/shared/storage.js',
  'src/content/indicator.js',
  'src/content/runtime.js'
];

test('manifest uses shared branding and minimal permissions', () => {
  assert.equal(manifest.name, 'Context Pinner');
  assert.equal(manifest.action.default_title, 'Context Pinner');
  assert.equal(manifest.version, '0.2.0');
  assert.doesNotMatch(manifest.description, /Kimi/);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.kimi.com/*',
    'https://chatgpt.com/*'
  ]);
});

test('manifest registers exact isolated script order for both supported sites', () => {
  const kimi = manifest.content_scripts.find((entry) =>
    entry.matches.length === 1 && entry.matches[0] === 'https://www.kimi.com/*' && !entry.world
  );
  const chatgpt = manifest.content_scripts.find((entry) =>
    entry.matches.length === 1 && entry.matches[0] === 'https://chatgpt.com/*'
  );

  assert.deepEqual(kimi.js, [...isolatedScripts, 'src/sites/kimi.js']);
  assert.equal(kimi.run_at, 'document_start');
  assert.deepEqual(chatgpt.js, [...isolatedScripts, 'src/sites/chatgpt.js']);
  assert.equal(chatgpt.run_at, 'document_start');
  assert.equal(chatgpt.world, undefined);
});

test('MAIN page bridge is Kimi-only and never loaded for ChatGPT', () => {
  const mainEntries = manifest.content_scripts.filter((entry) => entry.world === 'MAIN');
  assert.equal(mainEntries.length, 1);
  assert.deepEqual(mainEntries[0].matches, ['https://www.kimi.com/*']);
  assert.deepEqual(mainEntries[0].js, ['src/content/page-bridge.js']);
  assert.equal(mainEntries[0].run_at, 'document_start');

  for (const entry of manifest.content_scripts.filter((entry) => entry.matches.includes('https://chatgpt.com/*'))) {
    assert.equal(entry.world, undefined);
    assert.equal(entry.js.includes('src/content/page-bridge.js'), false);
  }
});
