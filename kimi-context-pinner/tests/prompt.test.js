const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.KCP = {};
require('../src/shared/defaults.js');
require('../src/shared/prompt.js');

test('wrapPrompt prepends template body to original input', () => {
  const result = globalThis.KCP.wrapPrompt('Translate both ways.', '你好');
  assert.equal(result, '请按以下上下文处理用户输入。上下文模板：Translate both ways.用户输入：你好');
});

test('wrapPrompt returns original input when template is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('   ', 'hello'), 'hello');
});

test('wrapPrompt returns original input when input is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', '   '), '   ');
});

test('wrapPrompt does not double wrap marked input', () => {
  const wrapped = '请按以下上下文处理用户输入。上下文模板：Translate.用户输入：hello';
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', wrapped), wrapped);
});
