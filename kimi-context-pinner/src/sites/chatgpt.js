(function attachChatGPTAdapter(root) {
  const KCP = root.KCP || {};

  function isActive(element) {
    if (!element || !element.isConnected) return false;
    const view = element.ownerDocument && element.ownerDocument.defaultView;
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
      const inline = current.style;
      if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) return false;
      if (view && typeof view.getComputedStyle === 'function') {
        const style = view.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
    }
    return true;
  }

  function isEnabled(button) {
    return !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && isActive(button);
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
      const primaryEditors = document.querySelectorAll('#prompt-textarea[contenteditable="true"]');
      for (const primary of primaryEditors) {
        if (isActive(primary)) return withInnerTextFallback(primary);
      }

      const preferred = document.querySelectorAll(
        'form[data-type="unified-composer"] .ProseMirror[contenteditable="true"]'
      );
      for (const candidate of preferred) {
        if (isActive(candidate)) return withInnerTextFallback(candidate);
      }

      const candidates = document.querySelectorAll('form .ProseMirror[contenteditable="true"]');
      for (const candidate of candidates) {
        if (isActive(candidate)) return withInnerTextFallback(candidate);
      }
      return null;
    }

    function findSendButton() {
      const editor = findEditor();
      if (!editor) return null;
      const composer = editor.closest('[data-type="unified-composer"], form');
      if (!composer || !isActive(composer)) return null;

      const primaryButtons = composer.querySelectorAll('button[data-testid="send-button"]');
      for (const button of primaryButtons) {
        if (isEnabled(button)) return button;
      }
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

    function dispatchEditorEvents(editor, text, inputObserved, changeObserved) {
      const view = editor.ownerDocument && editor.ownerDocument.defaultView;
      const InputEventConstructor = (view && view.InputEvent) || root.InputEvent
        || (view && view.Event) || root.Event;
      const EventConstructor = (view && view.Event) || root.Event;
      if (!inputObserved) {
        editor.dispatchEvent(new InputEventConstructor('input', {
          bubbles: true,
          inputType: 'insertText',
          data: text
        }));
      }
      if (!changeObserved) editor.dispatchEvent(new EventConstructor('change', { bubbles: true }));
    }

    function replaceEditorText(editor, text) {
      if (!editor) return false;
      const target = String(text);
      try {
        editor.focus();
        if (!selectEditorContents(editor)) return false;

        if (typeof document.execCommand !== 'function') return false;

        let inputObserved = false;
        let changeObserved = false;
        const observeInput = () => { inputObserved = true; };
        const observeChange = () => { changeObserved = true; };
        editor.addEventListener('input', observeInput);
        editor.addEventListener('change', observeChange);
        try {
          document.execCommand('insertText', false, target);
        } catch (_error) {
          return false;
        } finally {
          editor.removeEventListener('input', observeInput);
          editor.removeEventListener('change', observeChange);
        }
        if (readEditorText(editor) !== target) return false;
        dispatchEditorEvents(editor, target, inputObserved, changeObserved);
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
