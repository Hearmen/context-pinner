const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('popup uses the Context Pinner brand', () => {
  const html = fs.readFileSync('src/popup/popup.html', 'utf8');
  assert.match(html, /<title>Context Pinner<\/title>/);
  assert.match(html, /<h1>Context Pinner<\/h1>/);
  assert.doesNotMatch(html, /Kimi Context/);
});

test('popup exposes an automatic injection toggle wired to settings.enabled', () => {
  const html = fs.readFileSync('src/popup/popup.html', 'utf8');
  const script = fs.readFileSync('src/popup/popup.js', 'utf8');

  assert.match(html, /id="enabledToggle"/);
  assert.match(html, /自动注入/);
  assert.match(script, /enabledToggle/);
  assert.match(script, /settings\.enabled/);
});

test('popup loads supported-site and active-tab helpers before popup logic', () => {
  const html = fs.readFileSync('src/popup/popup.html', 'utf8');
  const sitesIndex = html.indexOf('../shared/sites.js');
  const activeTabIndex = html.indexOf('./active-tab.js');
  const popupIndex = html.indexOf('./popup.js');

  assert.ok(sitesIndex >= 0);
  assert.ok(activeTabIndex > sitesIndex);
  assert.ok(popupIndex > activeTabIndex);
});

test('only the enabled toggle action requests an active supported tab refresh', () => {
  const script = fs.readFileSync('src/popup/popup.js', 'utf8');
  const refreshCalls = script.match(/KCP\.refreshActiveSupportedTab\(\)/g) || [];
  const toggleHandler = script.match(/enabledToggle\.addEventListener\('change',[\s\S]*?\n  \}\);/);

  assert.equal(refreshCalls.length, 1);
  assert.ok(toggleHandler);
  assert.match(toggleHandler[0], /}, true\);/);
});
