(function attachChatGPTAdapter(root) {
  const KCP = root.KCP || {};

  function isHidden(element) {
    return !!(element && element.closest('[hidden], [aria-hidden="true"]'));
  }

  function isEnabled(button) {
    return !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !isHidden(button);
  }

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

  function createChatGPTAdapter() {
    function findEditor() {
      const primary = document.querySelector('#prompt-textarea[contenteditable="true"]');
      if (primary && !isHidden(primary)) return withInnerTextFallback(primary);

      const preferredComposer = document.querySelector('form[data-type="unified-composer"]');
      const preferred = preferredComposer
        && preferredComposer.querySelector('.ProseMirror[contenteditable="true"]');
      if (preferred && !isHidden(preferred)) return withInnerTextFallback(preferred);

      const candidates = document.querySelectorAll('form .ProseMirror[contenteditable="true"]');
      for (const candidate of candidates) {
        if (!isHidden(candidate)) return withInnerTextFallback(candidate);
      }
      return null;
    }

    function findSendButton() {
      const primaryButtons = document.querySelectorAll('button[data-testid="send-button"]');
      for (const button of primaryButtons) {
        if (isEnabled(button)) return button;
      }

      const editor = findEditor();
      if (!editor) return null;
      const composer = editor.closest('form[data-type="unified-composer"]') || editor.closest('form');
      if (!composer) return null;
      const submitButtons = composer.querySelectorAll('button[type="submit"]');
      for (const button of submitButtons) {
        if (isEnabled(button)) return button;
      }
      return null;
    }

    function readEditorText(editor) {
      return editor ? (editor.innerText || editor.textContent || '') : '';
    }

    function selectEditorContents(editor) {
      const ownerDocument = editor.ownerDocument || document;
      const view = ownerDocument.defaultView || root.window;
      const selection = view && view.getSelection && view.getSelection();
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
      const target = String(text);
      try {
        editor.focus();
        if (!selectEditorContents(editor)) return false;

        if (typeof document.execCommand === 'function') {
          try {
            document.execCommand('insertText', false, target);
          } catch (_error) {
            // Continue with the controlled DOM fallback.
          }
          if (readEditorText(editor) === target) {
            dispatchEditorEvents(editor, target);
            return true;
          }
        }

        const paragraph = editor.ownerDocument.createElement('p');
        paragraph.appendChild(editor.ownerDocument.createTextNode(target));
        editor.replaceChildren(paragraph);
        if (readEditorText(editor) !== target) return false;
        dispatchEditorEvents(editor, target);
        return true;
      } catch (_error) {
        return false;
      }
    }

    return { id: 'chatgpt', findEditor, findSendButton, readEditorText, replaceEditorText };
  }

  KCP.createChatGPTAdapter = createChatGPTAdapter;
  root.KCP = KCP;

  if (!root.__KCP_TEST__ && document.documentElement) {
    KCP.createContentRuntime(KCP.createChatGPTAdapter()).start();
  }
})(globalThis);
