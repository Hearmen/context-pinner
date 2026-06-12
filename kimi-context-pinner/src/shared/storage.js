(function attachStorage(root) {
  const KCP = root.KCP || {};

  function cloneTemplate(template) {
    const source = template && typeof template === 'object' ? template : {};
    return {
      id: String(source.id || ''),
      title: String(source.title || ''),
      body: String(source.body || '')
    };
  }

  function normalizeSettings(settings) {
    const inputTemplates = Array.isArray(settings && settings.templates)
      ? settings.templates
      : KCP.DEFAULT_TEMPLATES;

    const templates = inputTemplates
      .map(cloneTemplate)
      .filter((template) => template.id && template.title);

    const safeTemplates = templates.length > 0
      ? templates
      : KCP.DEFAULT_TEMPLATES.map(cloneTemplate);

    const requestedActiveId = settings && settings.activeTemplateId;
    const activeExists = safeTemplates.some((template) => template.id === requestedActiveId);

    return {
      templates: safeTemplates,
      activeTemplateId: activeExists ? requestedActiveId : safeTemplates[0].id,
      enabled: settings && settings.enabled === false ? false : true
    };
  }

  function getChromeStorage() {
    return root.chrome && root.chrome.storage && root.chrome.storage.sync;
  }

  function loadSettings() {
    const storage = getChromeStorage();
    if (!storage) {
      return Promise.resolve(normalizeSettings({}));
    }

    return new Promise((resolve) => {
      storage.get([KCP.STORAGE_KEYS.templates, KCP.STORAGE_KEYS.activeTemplateId, KCP.STORAGE_KEYS.enabled], (items) => {
        if (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) {
          resolve(normalizeSettings({}));
          return;
        }

        resolve(normalizeSettings({
          templates: items[KCP.STORAGE_KEYS.templates],
          activeTemplateId: items[KCP.STORAGE_KEYS.activeTemplateId],
          enabled: items[KCP.STORAGE_KEYS.enabled]
        }));
      });
    });
  }

  function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    const storage = getChromeStorage();
    if (!storage) {
      return Promise.resolve(normalized);
    }

    return new Promise((resolve, reject) => {
      storage.set({
        [KCP.STORAGE_KEYS.templates]: normalized.templates,
        [KCP.STORAGE_KEYS.activeTemplateId]: normalized.activeTemplateId,
        [KCP.STORAGE_KEYS.enabled]: normalized.enabled
      }, () => {
        if (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) {
          reject(new Error(root.chrome.runtime.lastError.message));
          return;
        }
        resolve(normalized);
      });
    });
  }

  function getActiveTemplate(settings) {
    const normalized = normalizeSettings(settings);
    return normalized.templates.find((template) => template.id === normalized.activeTemplateId) || null;
  }

  KCP.normalizeSettings = normalizeSettings;
  KCP.loadSettings = loadSettings;
  KCP.saveSettings = saveSettings;
  KCP.getActiveTemplate = getActiveTemplate;
  root.KCP = KCP;
})(globalThis);
