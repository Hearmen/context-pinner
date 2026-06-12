(function attachPageBridge(root) {
  const SET_TEXT_EVENT = 'kcp:set-editor-text';
  const RESULT_ATTR = 'data-kcp-page-replace-result';

  function findEditor() {
    return document.querySelector('.chat-input-editor[contenteditable=true]')
      || document.querySelector('[role="textbox"][contenteditable=true]');
  }

  function buildEditorState(text) {
    return {
      root: {
        children: [{
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            type: 'text',
            version: 1
          }],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
          textFormat: 0
        }],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1
      }
    };
  }

  function replaceLexicalText(text) {
    const editor = findEditor();
    const lexicalEditor = editor && editor.__lexicalEditor;
    if (!lexicalEditor || !lexicalEditor.parseEditorState || !lexicalEditor.setEditorState) {
      return false;
    }

    const editorState = lexicalEditor.parseEditorState(JSON.stringify(buildEditorState(text)));
    lexicalEditor.setEditorState(editorState);
    return true;
  }

  document.addEventListener(SET_TEXT_EVENT, (event) => {
    let nonce = '';
    let ok = false;

    try {
      const payload = JSON.parse(String(event.detail || '{}'));
      nonce = String(payload.nonce || '');
      ok = replaceLexicalText(String(payload.text || ''));
    } catch (error) {
      ok = false;
    }

    if (nonce && document.documentElement) {
      document.documentElement.setAttribute(RESULT_ATTR, `${nonce}:${ok ? 'true' : 'false'}`);
    }
  }, true);

  root.__KCP_PAGE_BRIDGE__ = true;
})(globalThis);
