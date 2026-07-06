(function initPopup(root) {
  const KCP = root.KCP;
  const select = document.getElementById('templateSelect');
  const enabledToggle = document.getElementById('enabledToggle');
  const titleInput = document.getElementById('templateTitle');
  const bodyInput = document.getElementById('templateBody');
  const status = document.getElementById('status');
  const saveButton = document.getElementById('saveButton');
  const addButton = document.getElementById('addButton');
  const duplicateButton = document.getElementById('duplicateButton');
  const deleteButton = document.getElementById('deleteButton');
  const controls = [select, enabledToggle, titleInput, bodyInput, saveButton, addButton, duplicateButton, deleteButton];

  let settings = null;
  let lastSavedSettings = null;
  let isSaving = false;

  function cloneSettings(source) {
    return KCP.normalizeSettings({
      templates: source ? source.templates : [],
      activeTemplateId: source ? source.activeTemplateId : '',
      enabled: source ? source.enabled : true
    });
  }

  function updateControls() {
    const disabled = !settings || isSaving;
    for (const control of controls) {
      control.disabled = disabled;
    }
    if (settings && !isSaving) {
      deleteButton.disabled = settings.templates.length <= 1;
    }
  }

  function setStatus(message) {
    status.textContent = message;
    if (message) {
      setTimeout(() => {
        if (status.textContent === message) status.textContent = '';
      }, 1600);
    }
  }

  function createId() {
    return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function currentTemplate() {
    if (!settings) return null;
    return settings.templates.find((template) => template.id === settings.activeTemplateId) || settings.templates[0];
  }

  function render() {
    if (!settings) {
      updateControls();
      return;
    }

    select.textContent = '';
    for (const template of settings.templates) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.title;
      select.append(option);
    }
    select.value = settings.activeTemplateId;
    enabledToggle.checked = settings.enabled !== false;

    const template = currentTemplate();
    titleInput.value = template ? template.title : '';
    bodyInput.value = template ? template.body : '';
    updateControls();
  }

  async function restoreAfterFailedSave(fallbackSettings) {
    try {
      settings = await KCP.loadSettings();
    } catch (error) {
      settings = cloneSettings(fallbackSettings);
    }
    lastSavedSettings = cloneSettings(settings);
  }

  function updateCurrentFromInputs() {
    const template = currentTemplate();
    if (!template) return;
    template.title = titleInput.value.trim() || '未命名模板';
    template.body = bodyInput.value;
  }

  async function runAction(message, action, refreshActiveTab = false) {
    if (!settings || isSaving) return;

    const fallbackSettings = cloneSettings(lastSavedSettings || settings);
    isSaving = true;
    updateControls();

    try {
      action();
      settings = await KCP.saveSettings(settings);
      lastSavedSettings = cloneSettings(settings);
      if (refreshActiveTab) {
        try {
          await KCP.refreshActiveSupportedTab();
          setStatus(message);
        } catch (_error) {
          setStatus('刷新失败');
        }
      } else {
        setStatus(message);
      }
    } catch (error) {
      await restoreAfterFailedSave(fallbackSettings);
      setStatus((error && error.message) || '保存失败');
    } finally {
      isSaving = false;
      render();
    }
  }

  select.addEventListener('change', () => {
    const selectedId = select.value;
    runAction('已切换', () => {
      updateCurrentFromInputs();
      settings.activeTemplateId = selectedId;
    });
  });

  enabledToggle.addEventListener('change', () => {
    const enabled = enabledToggle.checked;
    runAction(enabled ? '已开启' : '已关闭', () => {
      updateCurrentFromInputs();
      settings.enabled = enabled;
    }, true);
  });

  saveButton.addEventListener('click', () => {
    runAction('已保存', () => {
      updateCurrentFromInputs();
      settings.enabled = enabledToggle.checked;
    });
  });

  addButton.addEventListener('click', () => {
    runAction('已新增', () => {
      updateCurrentFromInputs();
      const template = {
        id: createId(),
        title: '新模板',
        body: ''
      };
      settings.templates.push(template);
      settings.activeTemplateId = template.id;
    });
  });

  duplicateButton.addEventListener('click', () => {
    runAction('已复制', () => {
      updateCurrentFromInputs();
      const source = currentTemplate();
      if (!source) return;
      const template = {
        id: createId(),
        title: `${source.title} 副本`,
        body: source.body
      };
      settings.templates.push(template);
      settings.activeTemplateId = template.id;
    });
  });

  deleteButton.addEventListener('click', () => {
    runAction('已删除', () => {
      const template = currentTemplate();
      if (!template) return;
      settings.templates = settings.templates.filter((item) => item.id !== template.id);
      settings.activeTemplateId = settings.templates[0] ? settings.templates[0].id : '';
    });
  });

  updateControls();

  KCP.loadSettings()
    .then((loaded) => {
      settings = loaded;
      lastSavedSettings = cloneSettings(settings);
      render();
    })
    .catch((error) => {
      settings = KCP.normalizeSettings({});
      lastSavedSettings = cloneSettings(settings);
      render();
      setStatus(error.message || '加载失败');
    });
})(globalThis);
