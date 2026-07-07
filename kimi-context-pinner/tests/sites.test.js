const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.KCP = {};
require('../src/shared/sites.js');

test('recognizes Kimi chat URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite('https://www.kimi.com/chat/abc').id, 'kimi');
});

test('recognizes ChatGPT root and path URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite('https://chatgpt.com/').id, 'chatgpt');
  assert.equal(globalThis.KCP.getSupportedSite('https://chatgpt.com/c/abc').id, 'chatgpt');
});

test('rejects ChatGPT lookalikes and non-default origins', () => {
  const unsupportedUrls = [
    'http://chatgpt.com/',
    'https://chat.openai.com/',
    'https://www.chatgpt.com/',
    'https://sub.chatgpt.com/',
    'https://chatgpt.com.evil.example/',
    'https://chatgpt.com:444/'
  ];

  for (const url of unsupportedUrls) {
    assert.equal(globalThis.KCP.getSupportedSite(url), null, url);
  }
});

test('rejects Kimi lookalikes and non-default origins', () => {
  const unsupportedUrls = [
    'https://www.kimi.com:444/',
    'http://www.kimi.com/',
    'https://kimi.com/',
    'https://sub.www.kimi.com/'
  ];

  for (const url of unsupportedUrls) {
    assert.equal(globalThis.KCP.getSupportedSite(url), null, url);
  }
});

test('registers exactly Kimi and ChatGPT once each', () => {
  assert.deepEqual(globalThis.KCP.SUPPORTED_SITES.map((site) => site.id), ['kimi', 'chatgpt']);
});

test('rejects malformed URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite('not a URL'), null);
});

test('rejects non-string URLs', () => {
  assert.equal(globalThis.KCP.getSupportedSite(undefined), null);
});
