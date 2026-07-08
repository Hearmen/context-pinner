(function attachContentRuntime(root) {
  const KCP = root.KCP || {};
  const REQUIRED_ADAPTER_METHODS = [
    'findEditor',
    'findSendButton',
    'readEditorText',
    'replaceEditorText'
  ];

  function defaultTemplateBody() {
    try {
      if (typeof KCP.normalizeSettings === 'function' && typeof KCP.getActiveTemplate === 'function') {
        const activeTemplate = KCP.getActiveTemplate(KCP.normalizeSettings({}));
        return activeTemplate && typeof activeTemplate.body === 'string' && activeTemplate.body.trim()
          ? activeTemplate.body
          : '';
      }
    } catch (_error) {
      // Fall through to the raw defaults when shared setting helpers are unavailable.
    }

    const template = Array.isArray(KCP.DEFAULT_TEMPLATES) && KCP.DEFAULT_TEMPLATES[0];
    return template && typeof template.body === 'string' && template.body.trim()
      ? template.body
      : '';
  }

  function activePayloadFromTemplate(template) {
    const body = template && typeof template.body === 'string' ? template.body : '';
    const skills = Array.isArray(template && template.skills)
      ? template.skills.filter((skill) => (
        skill
        && skill.enabled !== false
        && typeof skill.content === 'string'
        && skill.content.trim()
      ))
      : [];
    return { body, skills };
  }

  function createContentRuntime(adapter) {
    REQUIRED_ADAPTER_METHODS.forEach((method) => {
      if (!adapter || typeof adapter[method] !== 'function') {
        throw new TypeError(`Content adapter must provide ${method}()`);
      }
    });

    let cachedEnabled = true;
    let cachedActiveTemplatePayload = { body: defaultTemplateBody(), skills: [] };
    let hasLoadedSettings = false;
    let refreshRequestVersion = 0;
    let documentCaptureBound = false;
    let storageBound = false;
    let observer = null;
    const boundEditors = new WeakSet();
    const boundButtons = new WeakSet();
    const handledEvents = new WeakSet();

    function syncCachedIndicator(force) {
      if (!hasLoadedSettings || typeof KCP.syncEnabledIndicator !== 'function') return;
      const existing = document.getElementById && document.getElementById('kcp-enabled-indicator');
      if (!force && (cachedEnabled ? !!existing : !existing)) return;

      let site = null;
      try {
        site = typeof KCP.getSupportedSite === 'function'
          ? KCP.getSupportedSite(document.location.href)
          : null;
      } catch (_error) {
        site = null;
      }
      try {
        KCP.syncEnabledIndicator(cachedEnabled, site ? site.indicatorText : '● Context 已开启');
      } catch (_error) {
        // Indicator failures must not discard loaded settings or break DOM observation.
      }
    }

    async function refreshActiveTemplate() {
      const requestVersion = ++refreshRequestVersion;
      if (typeof KCP.loadSettings !== 'function') return cachedActiveTemplatePayload;

      const loadedSettings = await KCP.loadSettings();
      if (requestVersion !== refreshRequestVersion) return cachedActiveTemplatePayload;

      let settings = loadedSettings || {};
      try {
        if (typeof KCP.normalizeSettings === 'function') settings = KCP.normalizeSettings(settings);
      } catch (_error) {
        settings = loadedSettings || {};
      }

      let activeTemplate = null;
      try {
        if (typeof KCP.getActiveTemplate === 'function') activeTemplate = KCP.getActiveTemplate(settings);
      } catch (_error) {
        activeTemplate = null;
      }

      cachedEnabled = settings.enabled !== false;
      cachedActiveTemplatePayload = activePayloadFromTemplate(activeTemplate);
      hasLoadedSettings = true;
      syncCachedIndicator(true);
      return cachedActiveTemplatePayload;
    }

    function wrapCurrentEditorInput() {
      if (!hasLoadedSettings) return false;
      const payload = cachedActiveTemplatePayload;
      let editor;
      let original;
      try {
        editor = adapter.findEditor();
        if (
          !editor
          || !cachedEnabled
          || (!payload.body.trim() && payload.skills.length === 0)
        ) return false;
        original = adapter.readEditorText(editor);
      } catch (_error) {
        return false;
      }

      if (typeof original !== 'string' || !original.trim() || typeof KCP.wrapPrompt !== 'function') return false;

      let wrapped;
      try {
        wrapped = KCP.wrapPrompt(payload, original);
      } catch (_error) {
        return false;
      }
      if (typeof wrapped !== 'string' || wrapped === original) return false;

      try {
        return adapter.replaceEditorText(editor, wrapped) !== false;
      } catch (_error) {
        return false;
      }
    }

    function handleWrapEvent(event) {
      if (handledEvents.has(event)) return false;
      handledEvents.add(event);
      return wrapCurrentEditorInput();
    }

    function eventTargetsEditor(event) {
      let editor;
      try {
        editor = adapter.findEditor();
      } catch (_error) {
        return false;
      }
      return !!editor && (event.target === editor || editor.contains(event.target));
    }

    function eventTargetsSendButton(event) {
      let button;
      try {
        button = adapter.findSendButton();
      } catch (_error) {
        return false;
      }
      if (!button) return false;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      return path.includes(button) || event.target === button || button.contains(event.target);
    }

    function bindEditor(editor) {
      if (!editor || boundEditors.has(editor)) return;
      boundEditors.add(editor);
      editor.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        handleWrapEvent(event);
      }, true);
    }

    function bindSendButton(button) {
      if (!button || boundButtons.has(button)) return;
      boundButtons.add(button);
      button.addEventListener('click', handleWrapEvent, true);
    }

    function bindProviderDom() {
      try {
        bindEditor(adapter.findEditor());
        bindSendButton(adapter.findSendButton());
      } catch (_error) {
        // Provider DOM can be incomplete while a page is rendering.
      }
    }

    function bindDocumentCapture() {
      if (documentCaptureBound) return;
      documentCaptureBound = true;
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || !eventTargetsEditor(event)) return;
        handleWrapEvent(event);
      }, true);
      document.addEventListener('click', (event) => {
        if (eventTargetsSendButton(event)) handleWrapEvent(event);
      }, true);
    }

    function bindStorage() {
      if (storageBound || !root.chrome || !root.chrome.storage || !root.chrome.storage.onChanged) return;
      storageBound = true;
      root.chrome.storage.onChanged.addListener((changes, areaName) => {
        if (typeof areaName !== 'undefined' && areaName !== 'sync') return;
        const relevant = ['templates', 'activeTemplateId', 'enabled'].some((key) => (
          changes && Object.prototype.hasOwnProperty.call(changes, key)
        ));
        if (relevant) refreshActiveTemplate().catch(() => {});
      });
    }

    function bindObserver() {
      if (observer || typeof MutationObserver !== 'function' || !document.documentElement) return;
      observer = new MutationObserver(() => {
        bindProviderDom();
        syncCachedIndicator(false);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function start() {
      bindDocumentCapture();
      bindProviderDom();
      refreshActiveTemplate().catch(() => {});
      bindStorage();
      bindObserver();
    }

    function setCachedTemplateBodyForTest(body) {
      cachedActiveTemplatePayload = { body: String(body || ''), skills: [] };
      hasLoadedSettings = true;
    }

    function setEnabledForTest(enabled) {
      cachedEnabled = enabled !== false;
    }

    return {
      refreshActiveTemplate,
      wrapCurrentEditorInput,
      bindProviderDom,
      start,
      setCachedTemplateBodyForTest,
      setEnabledForTest
    };
  }

  KCP.createContentRuntime = createContentRuntime;
  root.KCP = KCP;
})(globalThis);
