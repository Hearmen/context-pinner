const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('popup exposes an automatic injection toggle wired to settings.enabled', () => {
  const html = fs.readFileSync('src/popup/popup.html', 'utf8');
  const script = fs.readFileSync('src/popup/popup.js', 'utf8');

  assert.match(html, /id="enabledToggle"/);
  assert.match(html, /自动注入/);
  assert.match(script, /enabledToggle/);
  assert.match(script, /settings\.enabled/);
});
