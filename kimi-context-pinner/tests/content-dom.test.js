const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadPageBridge(html) {
  const dom = new JSDOM(html, { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.__KCP_TEST__ = true;
  delete require.cache[require.resolve('../src/content/page-bridge.js')];
  require('../src/content/page-bridge.js');
  return dom;
}

test('page bridge replaces Lexical editor state from its independent DOM event', () => {
  const dom = loadPageBridge('<div class="chat-input-editor" contenteditable="true" role="textbox">old</div>');
  const editor = document.querySelector('.chat-input-editor');
  let lexicalText = 'old';
  editor.__lexicalEditor = {
    parseEditorState: JSON.parse,
    setEditorState(state) { lexicalText = state.root.children[0].children[0].text; }
  };

  document.dispatchEvent(new window.CustomEvent('kcp:set-editor-text', {
    detail: JSON.stringify({ nonce: 'n1', text: 'new exact text' })
  }));

  assert.equal(lexicalText, 'new exact text');
  assert.equal(document.documentElement.getAttribute('data-kcp-page-replace-result'), 'n1:true');
  dom.window.close();
});
