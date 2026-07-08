const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.KCP = {};
require('../src/shared/defaults.js');
require('../src/shared/prompt.js');

test('wrapPrompt prepends template body to original input', () => {
  const result = globalThis.KCP.wrapPrompt('Translate both ways.', '你好');
  assert.equal(result, '请按以下上下文处理用户输入。\n\n上下文模板：\nTranslate both ways.\n\n用户输入：\n你好');
});

test('wrapPrompt injects enabled skill content', () => {
  const result = globalThis.KCP.wrapPrompt({
    body: 'Template body',
    skills: [
      { name: 'review', content: 'Review carefully.', enabled: true },
      { name: 'disabled', content: 'Do not include.', enabled: false },
      { name: 'empty', content: '   ', enabled: true },
    ],
  }, 'question');

  assert.equal(result, [
    '请按以下上下文处理用户输入。',
    '',
    '上下文模板：',
    'Template body',
    '',
    '启用 Skills：',
    '## review',
    'Review carefully.',
    '',
    '用户输入：',
    'question',
  ].join('\n'));
});

test('wrapPrompt accepts payload objects without skills', () => {
  const result = globalThis.KCP.wrapPrompt({ body: 'Summarize.' }, 'hello');
  assert.equal(result, '请按以下上下文处理用户输入。\n\n上下文模板：\nSummarize.\n\n用户输入：\nhello');
});

test('wrapPrompt returns original input when template is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('   ', 'hello'), 'hello');
});

test('wrapPrompt returns original input when input is blank', () => {
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', '   '), '   ');
});

test('wrapPrompt does not double wrap marked input', () => {
  const wrapped = '请按以下上下文处理用户输入。\n\n上下文模板：\nTranslate.\n\n用户输入：\nhello';
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', wrapped), wrapped);
});
