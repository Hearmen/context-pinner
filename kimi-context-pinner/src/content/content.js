(function attachContent(root) {
  const KCP = root.KCP || {};
  const BOUND_ATTR = 'data-kcp-bound';
  const DOCUMENT_BOUND_ATTR = 'data-kcp-document-bound';
  const PAGE_SET_TEXT_EVENT = 'kcp:set-editor-text';
  const PAGE_RESULT_ATTR = 'data-kcp-page-replace-result';
  let cachedEnabled = true;
  let cachedActiveTemplateBody = getDefaultActiveTemplateBody();

  function getDefaultActiveTemplateBody() {
    if (KCP.normalizeSettings && KCP.getActiveTemplate) {
      const activeTemplate = KCP.getActiveTemplate(KCP.normalizeSettings({}));
      return activeTemplate && activeTemplate.body.trim()
        ? activeTemplate.body
        : '';
    }

    const defaultTemplate = KCP.DEFAULT_TEMPLATES && KCP.DEFAULT_TEMPLATES[0];
    return defaultTemplate && defaultTemplate.body && defaultTemplate.body.trim()
      ? defaultTemplate.body
      : '';
  }

  function withInnerTextFallback(editor) {
    if (editor && typeof editor.innerText === 'undefined') {
      Object.defineProperty(editor, 'innerText', {
        configurable: true,
        get() {
          return this.textContent;
        },
        set(value) {
          this.textContent = value;
        }
      });
    }
    return editor;
  }

  function findEditor() {
    return withInnerTextFallback(
      document.querySelector('.chat-input-editor[contenteditable=true]')
        || document.querySelector('[role="textbox"][contenteditable=true]')
    );
  }

  function findSendButton() {
    const icon = document.querySelector('.chat-editor .send-icon') || document.querySelector('.send-icon');
    if (!icon) return null;
    return icon.closest('.send-button-container') || icon.parentElement;
  }

  function selectEditorContents(editor) {
    const view = editor.ownerDocument && editor.ownerDocument.defaultView;
    const getSelection = (view && view.getSelection) || root.getSelection;
    const selection = getSelection && getSelection.call(view || root);
    if (!selection || !document.createRange) return false;
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function replaceLexicalEditorText(editor, text) {
    const lexicalEditor = editor && editor.__lexicalEditor;
    if (!lexicalEditor || !lexicalEditor.parseEditorState || !lexicalEditor.setEditorState) {
      return false;
    }

    const stateJson = {
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

    try {
      const editorState = lexicalEditor.parseEditorState(JSON.stringify(stateJson));
      lexicalEditor.setEditorState(editorState);
      return true;
    } catch (error) {
      return false;
    }
  }

  function replacePageEditorText(text) {
    if (!document.documentElement) return false;

    const nonce = `${Date.now()}:${Math.random()}`;
    document.documentElement.removeAttribute(PAGE_RESULT_ATTR);

    const view = document.defaultView || root.window || root;
    const EventConstructor = view.CustomEvent || root.CustomEvent;
    if (!EventConstructor) return false;

    document.dispatchEvent(new EventConstructor(PAGE_SET_TEXT_EVENT, {
      bubbles: false,
      detail: JSON.stringify({ nonce, text })
    }));

    return document.documentElement.getAttribute(PAGE_RESULT_ATTR) === `${nonce}:true`;
  }

  function replaceEditorText(editor, text) {
    editor.focus();
    let inserted = replacePageEditorText(text) || replaceLexicalEditorText(editor, text);

    const selected = inserted ? false : selectEditorContents(editor);

    if (selected && document.execCommand) {
      inserted = document.execCommand('insertText', false, text);
    }

    if (!inserted || editor.textContent !== text) {
      editor.textContent = text;
    }

    const view = editor.ownerDocument && editor.ownerDocument.defaultView;
    const InputEventConstructor = (view && view.InputEvent) || root.InputEvent || (view && view.Event) || root.Event;
    const EventConstructor = (view && view.Event) || root.Event;
    editor.dispatchEvent(new InputEventConstructor('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    }));
    editor.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  }

  async function refreshActiveTemplate() {
    const settings = await KCP.loadSettings();
    const activeTemplate = KCP.getActiveTemplate(settings);
    cachedEnabled = settings.enabled !== false;
    cachedActiveTemplateBody = activeTemplate && activeTemplate.body.trim()
      ? activeTemplate.body
      : '';
    return cachedActiveTemplateBody;
  }

  function wrapCurrentEditorInput() {
    const editor = findEditor();
    if (!editor) return false;

    const original = editor.innerText || editor.textContent || '';
    if (!cachedEnabled) return false;
    if (!cachedActiveTemplateBody.trim()) return false;

    const wrapped = KCP.wrapPrompt(cachedActiveTemplateBody, original);
    if (wrapped === original) return false;

    replaceEditorText(editor, wrapped);
    return true;
  }

  function bindEditor(editor) {
    if (!editor || editor.getAttribute(BOUND_ATTR) === 'true') return;
    editor.setAttribute(BOUND_ATTR, 'true');
    editor.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      wrapCurrentEditorInput();
    }, true);
  }

  function bindSendButton(button) {
    if (!button || button.getAttribute(BOUND_ATTR) === 'true') return;
    button.setAttribute(BOUND_ATTR, 'true');
    button.addEventListener('click', () => {
      wrapCurrentEditorInput();
    }, true);
  }

  function isEditorEvent(event) {
    const editor = findEditor();
    return !!editor && (event.target === editor || editor.contains(event.target));
  }

  function isSendButtonEvent(event) {
    const button = findSendButton();
    if (!button) return false;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.includes(button) || event.target === button || button.contains(event.target);
  }

  function bindDocumentCapture() {
    if (!document.documentElement || document.documentElement.getAttribute(DOCUMENT_BOUND_ATTR) === 'true') return;
    document.documentElement.setAttribute(DOCUMENT_BOUND_ATTR, 'true');

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      if (!isEditorEvent(event)) return;
      wrapCurrentEditorInput();
    }, true);

    document.addEventListener('click', (event) => {
      if (!isSendButtonEvent(event)) return;
      wrapCurrentEditorInput();
    }, true);
  }

  function bindKimiDom() {
    bindEditor(findEditor());
    bindSendButton(findSendButton());
  }

  function startContentScript() {
    bindDocumentCapture();
    bindKimiDom();
    refreshActiveTemplate();
    if (root.chrome && root.chrome.storage && root.chrome.storage.onChanged) {
      root.chrome.storage.onChanged.addListener(() => {
        refreshActiveTemplate();
      });
    }
    const observer = new MutationObserver(() => bindKimiDom());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function setCachedTemplateBodyForTest(body) {
    cachedActiveTemplateBody = String(body || '');
  }

  function setEnabledForTest(enabled) {
    cachedEnabled = enabled !== false;
  }

  KCP.findEditor = findEditor;
  KCP.findSendButton = findSendButton;
  KCP.replaceEditorText = replaceEditorText;
  KCP.refreshActiveTemplate = refreshActiveTemplate;
  KCP.wrapCurrentEditorInput = wrapCurrentEditorInput;
  KCP.bindKimiDom = bindKimiDom;
  KCP.startContentScript = startContentScript;
  KCP.setCachedTemplateBodyForTest = setCachedTemplateBodyForTest;
  KCP.setEnabledForTest = setEnabledForTest;
  root.KCP = KCP;

  if (document && document.documentElement && !root.__KCP_TEST__) {
    startContentScript();
  }
})(globalThis);
