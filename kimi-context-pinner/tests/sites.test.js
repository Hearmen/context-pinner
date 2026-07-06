const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.KCP = {};
require('../src/shared/sites.js');

test('recognizes Kimi chat URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite('https://www.kimi.com/chat/abc').id, 'kimi');
});

test('rejects unsupported sites', () => {
  assert.equal(globalThis.KCP.getSupportedSite('https://chatgpt.com/'), null);
});

test('rejects malformed URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite('not a URL'), null);
});

test('rejects non-string URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite(undefined), null);
});
