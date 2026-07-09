const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const expectedVersion = '0.3.0';
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
  assert.equal(manifest.version, expectedVersion);
  assert.doesNotMatch(manifest.description, /Kimi/);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.equal(Object.hasOwn(manifest, 'host_permissions'), false);
});

test('package metadata version matches manifest version', () => {
  assert.equal(packageJson.version, expectedVersion);
  assert.equal(packageLock.version, expectedVersion);
  assert.equal(packageLock.packages[''].version, expectedVersion);
  assert.equal(packageJson.version, manifest.version);
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

test('content script matches grant access only to exact supported hosts', () => {
  const matches = manifest.content_scripts.flatMap((entry) => entry.matches);
  assert.deepEqual([...new Set(matches)].sort(), [
    'https://chatgpt.com/*',
    'https://www.kimi.com/*'
  ]);
});
