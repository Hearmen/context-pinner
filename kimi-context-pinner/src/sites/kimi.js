(function attachKimiAdapter(root) {
  const KCP = root.KCP || {};
  const PAGE_SET_TEXT_EVENT = 'kcp:set-editor-text';
  const PAGE_RESULT_ATTR = 'data-kcp-page-replace-result';

  function withInnerTextFallback(editor) {
    if (editor && typeof editor.innerText === 'undefined') {
      Object.defineProperty(editor, 'innerText', {
        configurable: true,
        get() { return this.textContent; },
        set(value) { this.textContent = value; }
      });
    }
    return editor;
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

  function createKimiAdapter() {
    function findEditor() {
      return withInnerTextFallback(
        document.querySelector('.chat-input-editor[contenteditable=true]')
          || document.querySelector('[role="textbox"][contenteditable=true]')
      );
    }

    function findSendButton() {
      const icon = document.querySelector('.chat-editor .send-icon')
        || document.querySelector('.send-icon');
      return icon && (icon.closest('.send-button-container') || icon.parentElement);
    }

    function readEditorText(editor) {
      return editor ? (editor.innerText || editor.textContent || '') : '';
    }

    function replacePageEditorText(text) {
      if (!document.documentElement) return false;
      const view = document.defaultView || root.window || root;
      const CustomEventConstructor = view.CustomEvent || root.CustomEvent;
      if (!CustomEventConstructor) return false;

      const nonce = `${Date.now()}:${Math.random()}`;
      document.documentElement.removeAttribute(PAGE_RESULT_ATTR);
      document.dispatchEvent(new CustomEventConstructor(PAGE_SET_TEXT_EVENT, {
        bubbles: false,
        detail: JSON.stringify({ nonce, text })
      }));
      return document.documentElement.getAttribute(PAGE_RESULT_ATTR) === `${nonce}:true`;
    }

    function replaceLexicalEditorText(editor, text) {
      const lexicalEditor = editor && editor.__lexicalEditor;
      if (!lexicalEditor || !lexicalEditor.parseEditorState || !lexicalEditor.setEditorState) return false;
      try {
        const editorState = lexicalEditor.parseEditorState(JSON.stringify(buildEditorState(text)));
        lexicalEditor.setEditorState(editorState);
        return true;
      } catch (_error) {
        return false;
      }
    }

    function selectEditorContents(editor) {
      const ownerDocument = editor.ownerDocument || document;
      const view = ownerDocument.defaultView;
      const getSelection = (view && view.getSelection) || root.getSelection;
      const selection = getSelection && getSelection.call(view || root);
      if (!selection || !ownerDocument.createRange) return false;
      const range = ownerDocument.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    function dispatchEditorEvents(editor, text) {
      const view = editor.ownerDocument && editor.ownerDocument.defaultView;
      const InputEventConstructor = (view && view.InputEvent) || root.InputEvent
        || (view && view.Event) || root.Event;
      const EventConstructor = (view && view.Event) || root.Event;
      editor.dispatchEvent(new InputEventConstructor('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text
      }));
      editor.dispatchEvent(new EventConstructor('change', { bubbles: true }));
    }

    function replaceEditorText(editor, text) {
      if (!editor) return false;
      editor.focus();

      const reliableUpdate = replacePageEditorText(text) || replaceLexicalEditorText(editor, text);
      if (!reliableUpdate) {
        const selected = selectEditorContents(editor);
        let inserted = false;
        if (selected && document.execCommand) {
          inserted = document.execCommand('insertText', false, text);
        }
        if (!inserted || editor.textContent !== text) editor.textContent = text;
      }

      dispatchEditorEvents(editor, text);
      return true;
    }

    return { id: 'kimi', findEditor, findSendButton, readEditorText, replaceEditorText };
  }

  KCP.createKimiAdapter = createKimiAdapter;
  root.KCP = KCP;

  if (!root.__KCP_TEST__ && document.documentElement) {
    KCP.createContentRuntime(KCP.createKimiAdapter()).start();
  }
})(globalThis);
