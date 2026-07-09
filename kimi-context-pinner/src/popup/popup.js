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
  const addSkillButton = document.getElementById('addSkillButton');
  const skillFileInput = document.getElementById('skillFileInput');
  const skillsList = document.getElementById('skillsList');
  const skillEditor = document.getElementById('skillEditor');
  const skillNameInput = document.getElementById('skillNameInput');
  const skillContentInput = document.getElementById('skillContentInput');
  const skillDoneButton = document.getElementById('skillDoneButton');
  const skillDeleteButton = document.getElementById('skillDeleteButton');
  const controls = [
    select,
    enabledToggle,
    titleInput,
    bodyInput,
    saveButton,
    addButton,
    duplicateButton,
    deleteButton,
    addSkillButton,
    skillFileInput,
    skillNameInput,
    skillContentInput,
    skillDoneButton,
    skillDeleteButton
  ];

  let settings = null;
  let lastSavedSettings = null;
  let isSaving = false;
  let isImportingSkill = false;
  let editingSkillId = null;

  function cloneSettings(source) {
    return KCP.normalizeSettings({
      templates: source ? source.templates : [],
      activeTemplateId: source ? source.activeTemplateId : '',
      enabled: source ? source.enabled : true
    });
  }

  function updateControls() {
    const disabled = !settings || isSaving || isImportingSkill;
    for (const control of controls) {
      control.disabled = disabled;
    }
    if (skillsList) {
      for (const control of skillsList.querySelectorAll('input, button')) {
        control.disabled = disabled;
      }
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

  function createSkillId() {
    return `skill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function defaultSkillName() {
    return KCP.DEFAULT_SKILL_NAME || '未命名 Skill';
  }

  function currentTemplate() {
    if (!settings) return null;
    return settings.templates.find((template) => template.id === settings.activeTemplateId) || settings.templates[0];
  }

  function currentSkills() {
    const template = currentTemplate();
    if (!template) return [];
    if (!Array.isArray(template.skills)) template.skills = [];
    return template.skills;
  }

  function currentEditingSkill() {
    return currentSkills().find((skill) => skill.id === editingSkillId) || null;
  }

  function collapseSkillEditor() {
    editingSkillId = null;
    skillEditor.hidden = true;
    skillNameInput.value = '';
    skillContentInput.value = '';
  }

  function renderSkillEditor() {
    const skill = currentEditingSkill();
    if (!skill) {
      collapseSkillEditor();
      return;
    }
    skillEditor.hidden = false;
    skillNameInput.value = skill.name || defaultSkillName();
    skillContentInput.value = skill.content || '';
  }

  function renderSkills() {
    skillsList.textContent = '';
    const skills = currentSkills();
    for (const skill of skills) {
      const row = document.createElement('div');
      row.className = 'skill-row';

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = skill.enabled !== false;
      checkbox.dataset.skillEnabled = skill.id;
      checkbox.addEventListener('change', () => {
        const enabled = checkbox.checked;
        runAction('已保存', () => {
          updateCurrentFromInputs();
          const target = currentSkills().find((item) => item.id === skill.id);
          if (target) target.enabled = enabled;
        });
      });

      const name = document.createElement('span');
      name.className = 'skill-name';
      name.textContent = skill.name || defaultSkillName();
      label.append(checkbox, name);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = '编辑';
      editButton.dataset.skillEdit = skill.id;
      editButton.addEventListener('click', () => {
        editingSkillId = skill.id;
        renderSkillEditor();
        updateControls();
      });

      row.append(label, editButton);
      skillsList.append(row);
    }
    renderSkillEditor();
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
    renderSkills();
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

    const skill = currentEditingSkill();
    if (skill) {
      skill.name = skillNameInput.value.trim() || defaultSkillName();
      skill.content = skillContentInput.value;
    }
  }

  function parseSkillName(content) {
    const frontmatter = String(content || '').match(/^---\s*[\r\n]+([\s\S]*?)^---/m);
    if (!frontmatter) return defaultSkillName();
    const name = frontmatter[1].match(/^\s*name\s*:\s*['"]?(.+?)['"]?\s*$/m);
    return name && name[1] ? name[1].trim() || defaultSkillName() : defaultSkillName();
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
      collapseSkillEditor();
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
        body: '',
        skills: []
      };
      settings.templates.push(template);
      settings.activeTemplateId = template.id;
      collapseSkillEditor();
    });
  });

  duplicateButton.addEventListener('click', () => {
    runAction('已复制', () => {
      updateCurrentFromInputs();
      const source = currentTemplate();
      if (!source) return;
      const template = typeof KCP.cloneTemplateForDuplicate === 'function'
        ? KCP.cloneTemplateForDuplicate(source, createId(), createSkillId)
        : {
            id: createId(),
            title: `${source.title} 副本`,
            body: source.body,
            skills: currentSkills().map((skill) => ({ ...skill, id: createSkillId() }))
          };
      settings.templates.push(template);
      settings.activeTemplateId = template.id;
      collapseSkillEditor();
    });
  });

  deleteButton.addEventListener('click', () => {
    runAction('已删除', () => {
      const template = currentTemplate();
      if (!template) return;
      settings.templates = settings.templates.filter((item) => item.id !== template.id);
      settings.activeTemplateId = settings.templates[0] ? settings.templates[0].id : '';
      collapseSkillEditor();
    });
  });

  skillDoneButton.addEventListener('click', () => {
    const skillId = editingSkillId;
    if (!skillId) return;
    runAction('已保存', () => {
      updateCurrentFromInputs();
      const skill = currentSkills().find((item) => item.id === skillId);
      if (!skill) return;
      skill.name = skillNameInput.value.trim() || defaultSkillName();
      skill.content = skillContentInput.value;
      collapseSkillEditor();
    });
  });

  skillDeleteButton.addEventListener('click', () => {
    const skillId = editingSkillId;
    if (!skillId) return;
    runAction('已删除', () => {
      updateCurrentFromInputs();
      const template = currentTemplate();
      if (!template) return;
      template.skills = currentSkills().filter((skill) => skill.id !== skillId);
      collapseSkillEditor();
    });
  });

  addSkillButton.addEventListener('click', () => {
    runAction('已新增 Skill', () => {
      updateCurrentFromInputs();
      const template = currentTemplate();
      if (!template) return;
      if (!Array.isArray(template.skills)) template.skills = [];
      const skill = {
        id: createSkillId(),
        name: defaultSkillName(),
        content: '',
        enabled: true
      };
      template.skills.push(skill);
      editingSkillId = skill.id;
    });
  });

  skillFileInput.addEventListener('change', async () => {
    const file = skillFileInput.files && skillFileInput.files[0];
    if (!file || !settings) return;
    if (isSaving || isImportingSkill) {
      skillFileInput.value = '';
      setStatus('正在保存，请稍后再导入 Skill');
      return;
    }

    const targetTemplateId = settings.activeTemplateId;
    let content;
    isImportingSkill = true;
    updateControls();

    try {
      content = await file.text();
    } catch (_error) {
      setStatus('读取 Skill 失败');
      return;
    } finally {
      skillFileInput.value = '';
      isImportingSkill = false;
      updateControls();
    }

    if (isSaving) {
      setStatus('正在保存，请稍后再导入 Skill');
      return;
    }

    await runAction('已导入 Skill', () => {
      updateCurrentFromInputs();
      const template = settings.templates.find((item) => item.id === targetTemplateId);
      if (!template) return;
      if (!Array.isArray(template.skills)) template.skills = [];
      template.skills.push({
        id: createSkillId(),
        name: parseSkillName(content),
        content,
        enabled: true
      });
      collapseSkillEditor();
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
