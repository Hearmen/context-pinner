# Template Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-template skill import, enablement, editing, and skill-content prompt injection.

**Architecture:** Extend the existing template object with a `skills` array and keep all skill data under the existing `templates` storage key. The popup owns file import and skill editing; the content runtime only consumes normalized active-template payload and passes enabled skill content into the shared prompt wrapper.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript, JSDOM tests, Node `node:test`.

---

## File structure

- Modify `kimi-context-pinner/src/shared/storage.js`
  - Normalize `template.skills`.
  - Export helpers for cloning skills and duplicating templates with fresh skill IDs.
- Modify `kimi-context-pinner/src/shared/prompt.js`
  - Change `wrapPrompt` to accept either the legacy string body or a payload object `{ body, skills }`.
  - Inject enabled non-empty skill content.
- Modify `kimi-context-pinner/src/content/runtime.js`
  - Cache active template payload instead of only template body.
  - Pass `{ body, skills }` into `KCP.wrapPrompt`.
- Modify `kimi-context-pinner/src/popup/popup.html`
  - Add file input, skills list, and collapsible skill editor.
- Modify `kimi-context-pinner/src/popup/popup.css`
  - Style the skills section with compact controls suitable for popup width.
- Modify `kimi-context-pinner/src/popup/popup.js`
  - Render skills for the current template.
  - Import files with `File.text()`.
  - Parse `name:` from frontmatter.
  - Toggle, edit, save, collapse, delete skills.
  - Duplicate templates with independent skill IDs.
- Modify tests:
  - `kimi-context-pinner/tests/storage.test.js`
  - `kimi-context-pinner/tests/prompt.test.js`
  - `kimi-context-pinner/tests/runtime.test.js`
  - `kimi-context-pinner/tests/popup-static.test.js`
  - `kimi-context-pinner/tests/popup-behavior.test.js`

Run all commands from `kimi-context-pinner/` unless explicitly stated otherwise.

---

### Task 1: Storage model for per-template skills

**Files:**

- Modify: `kimi-context-pinner/src/shared/storage.js`
- Test: `kimi-context-pinner/tests/storage.test.js`

- [ ] **Step 1: Write failing storage tests**

Add these tests to `tests/storage.test.js`:

```js
test('normalizeSettings adds empty skills to old templates', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{ id: 'legacy', title: 'Legacy', body: 'Body' }],
    activeTemplateId: 'legacy'
  });
  assert.deepEqual(settings.templates[0].skills, []);
});

test('normalizeSettings preserves valid skills and filters invalid entries', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const settings = KCP.normalizeSettings({
    templates: [{
      id: 'with-skills',
      title: 'With skills',
      body: 'Body',
      skills: [
        { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: false },
        { id: '', name: 'Missing id', content: 'Bad', enabled: true },
        null,
        { id: 'skill-b', name: '', content: 'Content B' }
      ]
    }],
    activeTemplateId: 'with-skills'
  });
  assert.deepEqual(settings.templates[0].skills, [
    { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: false },
    { id: 'skill-b', name: '未命名 Skill', content: 'Content B', enabled: true }
  ]);
});

test('cloneTemplateForDuplicate creates independent skill ids', () => {
  const { KCP } = loadStorageWithFakeChrome();
  const duplicate = KCP.cloneTemplateForDuplicate({
    id: 'source',
    title: 'Source',
    body: 'Body',
    skills: [{ id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: true }]
  }, 'copy', () => 'new-skill-id');
  assert.equal(duplicate.id, 'copy');
  assert.equal(duplicate.title, 'Source 副本');
  assert.equal(duplicate.skills[0].id, 'new-skill-id');
  assert.equal(duplicate.skills[0].name, 'Skill A');
  assert.equal(duplicate.skills[0].content, 'Content A');
  assert.equal(duplicate.skills[0].enabled, true);
});
```

- [ ] **Step 2: Run storage tests to verify they fail**

Run:

```bash
npm test -- tests/storage.test.js
```

Expected: FAIL because `skills` are not normalized and `cloneTemplateForDuplicate` does not exist.

- [ ] **Step 3: Implement storage normalization**

In `src/shared/storage.js`, add helpers before `cloneTemplate`:

```js
  const DEFAULT_SKILL_NAME = '未命名 Skill';

  function cloneSkill(skill) {
    const source = skill && typeof skill === 'object' ? skill : {};
    const id = String(source.id || '');
    if (!id) return null;
    const name = String(source.name || '').trim() || DEFAULT_SKILL_NAME;
    return {
      id,
      name,
      content: String(source.content || ''),
      enabled: source.enabled === false ? false : true
    };
  }

  function normalizeSkills(skills) {
    if (!Array.isArray(skills)) return [];
    return skills.map(cloneSkill).filter(Boolean);
  }
```

Update `cloneTemplate`:

```js
  function cloneTemplate(template) {
    const source = template && typeof template === 'object' ? template : {};
    return {
      id: String(source.id || ''),
      title: String(source.title || ''),
      body: String(source.body || ''),
      skills: normalizeSkills(source.skills)
    };
  }
```

Add duplication helper:

```js
  function cloneTemplateForDuplicate(template, id, createSkillId) {
    const source = cloneTemplate(template);
    const nextSkillId = typeof createSkillId === 'function'
      ? createSkillId
      : () => `skill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      id: String(id || ''),
      title: `${source.title || '未命名模板'} 副本`,
      body: source.body,
      skills: source.skills.map((skill) => ({
        id: nextSkillId(skill),
        name: skill.name,
        content: skill.content,
        enabled: skill.enabled
      }))
    };
  }
```

Export helpers near the bottom:

```js
  KCP.DEFAULT_SKILL_NAME = DEFAULT_SKILL_NAME;
  KCP.cloneSkill = cloneSkill;
  KCP.normalizeSkills = normalizeSkills;
  KCP.cloneTemplateForDuplicate = cloneTemplateForDuplicate;
```

- [ ] **Step 4: Run storage tests to verify they pass**

Run:

```bash
npm test -- tests/storage.test.js
```

Expected: PASS for all storage tests.

- [ ] **Step 5: Commit storage model**

```bash
git add src/shared/storage.js tests/storage.test.js
git commit -m "Add per-template skill storage model"
```

---

### Task 2: Prompt wrapper injects enabled skill content

**Files:**

- Modify: `kimi-context-pinner/src/shared/prompt.js`
- Test: `kimi-context-pinner/tests/prompt.test.js`

- [ ] **Step 1: Write failing prompt tests**

Replace the first test in `tests/prompt.test.js` with the newline-aware expected output:

```js
test('wrapPrompt prepends template body to original input', () => {
  const result = globalThis.KCP.wrapPrompt('Translate both ways.', '你好');
  assert.equal(result, '请按以下上下文处理用户输入。\n\n上下文模板：\nTranslate both ways.\n\n用户输入：\n你好');
});
```

Add these tests:

```js
test('wrapPrompt injects enabled skill content', () => {
  const result = globalThis.KCP.wrapPrompt({
    body: 'Template body',
    skills: [
      { name: 'review', content: 'Review carefully.', enabled: true },
      { name: 'disabled', content: 'Do not include.', enabled: false },
      { name: 'empty', content: '   ', enabled: true }
    ]
  }, 'question');
  assert.equal(result, [
    '请按以下上下文处理用户输入。',
    '',
    '上下文模板：',
    'Template body',
    '',
    '启用 Skills：',
    '## review',
    'Review carefully.',
    '',
    '用户输入：',
    'question'
  ].join('\n'));
});

test('wrapPrompt accepts payload objects without skills', () => {
  const result = globalThis.KCP.wrapPrompt({ body: 'Only body', skills: [] }, 'question');
  assert.equal(result, '请按以下上下文处理用户输入。\n\n上下文模板：\nOnly body\n\n用户输入：\nquestion');
});
```

Update the double-wrap test expected marker to use the new format:

```js
test('wrapPrompt does not double wrap marked input', () => {
  const wrapped = '请按以下上下文处理用户输入。\n\n上下文模板：\nTranslate.\n\n用户输入：\nhello';
  assert.equal(globalThis.KCP.wrapPrompt('Translate.', wrapped), wrapped);
});
```

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```bash
npm test -- tests/prompt.test.js
```

Expected: FAIL because current `wrapPrompt` only accepts a string template body and uses the old compact format.

- [ ] **Step 3: Implement prompt payload formatting**

Replace `src/shared/prompt.js` contents inside `attachPrompt` with:

```js
  const HEADER = '请按以下上下文处理用户输入。';

  function isWrapped(input) {
    return typeof input === 'string' && input.trimStart().startsWith(HEADER);
  }

  function normalizePromptPayload(template) {
    if (typeof template === 'string') {
      return { body: template, skills: [] };
    }
    const source = template && typeof template === 'object' ? template : {};
    const skills = Array.isArray(source.skills) ? source.skills : [];
    return {
      body: String(source.body || ''),
      skills: skills
        .filter((skill) => skill && skill.enabled !== false && String(skill.content || '').trim())
        .map((skill) => ({
          name: String(skill.name || '').trim() || '未命名 Skill',
          content: String(skill.content || '').trim()
        }))
    };
  }

  function buildPrompt(payload, originalInput) {
    const sections = [
      HEADER,
      '',
      '上下文模板：',
      payload.body.trim()
    ];

    if (payload.skills.length > 0) {
      sections.push('', '启用 Skills：');
      for (const skill of payload.skills) {
        sections.push(`## ${skill.name}`, skill.content, '');
      }
      if (sections[sections.length - 1] === '') sections.pop();
    }

    sections.push('', '用户输入：', originalInput);
    return sections.join('\n');
  }

  function wrapPrompt(template, originalInput) {
    if (typeof originalInput !== 'string' || originalInput.trim() === '') {
      return originalInput;
    }

    const payload = normalizePromptPayload(template);
    if (!payload.body.trim() && payload.skills.length === 0) {
      return originalInput;
    }

    if (isWrapped(originalInput)) {
      return originalInput;
    }

    return buildPrompt(payload, originalInput);
  }
```

Keep exports:

```js
  KCP.PROMPT_MARKER = HEADER;
  KCP.isWrapped = isWrapped;
  KCP.wrapPrompt = wrapPrompt;
```

- [ ] **Step 4: Run prompt tests to verify they pass**

Run:

```bash
npm test -- tests/prompt.test.js
```

Expected: PASS for all prompt tests.

- [ ] **Step 5: Commit prompt injection**

```bash
git add src/shared/prompt.js tests/prompt.test.js
git commit -m "Inject enabled skill content into prompts"
```

---

### Task 3: Runtime consumes active template skill payload

**Files:**

- Modify: `kimi-context-pinner/src/content/runtime.js`
- Test: `kimi-context-pinner/tests/runtime.test.js`

- [ ] **Step 1: Write failing runtime tests**

Add this test to `tests/runtime.test.js` after `refresh loads active template and syncs enabled and disabled indicators`:

```js
test('refresh caches active template body and enabled skills', async () => {
  const { KCP, runtime } = loadRuntime('<body><div data-editor>question</div></body>');
  const payloads = [];
  KCP.loadSettings = () => Promise.resolve({
    enabled: true,
    templates: [{
      id: 'active',
      title: 'Active',
      body: 'Template body',
      skills: [
        { id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: true },
        { id: 'skill-b', name: 'Skill B', content: 'Content B', enabled: false }
      ]
    }],
    activeTemplateId: 'active'
  });
  KCP.wrapPrompt = (payload, input) => {
    payloads.push(payload);
    return `${payload.body}:${payload.skills.map((skill) => skill.name).join(',')}:${input}`;
  };

  await runtime.refreshActiveTemplate();
  assert.equal(runtime.wrapCurrentEditorInput(), true);
  assert.equal(document.querySelector('[data-editor]').textContent, 'Template body:Skill A:question');
  assert.deepEqual(payloads[0], {
    body: 'Template body',
    skills: [{ id: 'skill-a', name: 'Skill A', content: 'Content A', enabled: true }]
  });
});
```

- [ ] **Step 2: Run runtime tests to verify they fail**

Run:

```bash
npm test -- tests/runtime.test.js
```

Expected: FAIL because runtime passes only a template body string to `wrapPrompt`.

- [ ] **Step 3: Implement runtime payload caching**

In `src/content/runtime.js`, replace:

```js
    let cachedActiveTemplateBody = defaultTemplateBody();
```

with:

```js
    let cachedActiveTemplatePayload = { body: defaultTemplateBody(), skills: [] };
```

Add helper inside `createContentRuntime`:

```js
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
```

In `refreshActiveTemplate`, replace assignment to `cachedActiveTemplateBody` with:

```js
      cachedActiveTemplatePayload = activePayloadFromTemplate(activeTemplate);
```

and return:

```js
      return cachedActiveTemplatePayload;
```

Update stale request return from:

```js
      if (requestVersion !== refreshRequestVersion) return cachedActiveTemplateBody;
```

to:

```js
      if (requestVersion !== refreshRequestVersion) return cachedActiveTemplatePayload;
```

Update `wrapCurrentEditorInput` blank check:

```js
        if (
          !editor
          || !cachedEnabled
          || (!cachedActiveTemplatePayload.body.trim() && cachedActiveTemplatePayload.skills.length === 0)
        ) return false;
```

Update prompt wrapping call:

```js
        wrapped = KCP.wrapPrompt(cachedActiveTemplatePayload, original);
```

Update test helper:

```js
    function setCachedTemplateBodyForTest(body) {
      cachedActiveTemplatePayload = { body: String(body || ''), skills: [] };
      hasLoadedSettings = true;
    }
```

- [ ] **Step 4: Run runtime tests to verify they pass**

Run:

```bash
npm test -- tests/runtime.test.js
```

Expected: PASS for all runtime tests.

- [ ] **Step 5: Commit runtime payload support**

```bash
git add src/content/runtime.js tests/runtime.test.js
git commit -m "Pass active template skills through runtime"
```

---

### Task 4: Popup skill import, checkbox list, and collapsible editor

**Files:**

- Modify: `kimi-context-pinner/src/popup/popup.html`
- Modify: `kimi-context-pinner/src/popup/popup.css`
- Modify: `kimi-context-pinner/src/popup/popup.js`
- Test: `kimi-context-pinner/tests/popup-static.test.js`
- Test: `kimi-context-pinner/tests/popup-behavior.test.js`

- [ ] **Step 1: Write failing static popup tests**

Add to `tests/popup-static.test.js`:

```js
test('popup contains template skills controls', () => {
  const html = fs.readFileSync('src/popup/popup.html', 'utf8');
  assert.match(html, /id="skillFileInput"/);
  assert.match(html, /id="skillsList"/);
  assert.match(html, /id="skillEditor"/);
  assert.match(html, /id="skillNameInput"/);
  assert.match(html, /id="skillContentInput"/);
  assert.match(html, /id="skillDoneButton"/);
  assert.match(html, /id="skillDeleteButton"/);
});
```

- [ ] **Step 2: Write failing popup behavior tests**

Update `initialSettings` in `tests/popup-behavior.test.js`:

```js
const initialSettings = {
  templates: [
    {
      id: 'one',
      title: 'One',
      body: 'First',
      skills: [{ id: 'skill-one', name: 'Existing Skill', content: 'Existing content', enabled: true }]
    },
    { id: 'two', title: 'Two', body: 'Second', skills: [] }
  ],
  activeTemplateId: 'one',
  enabled: true
};
```

Add helper:

```js
function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
```

Add tests:

```js
test('popup renders skills and toggles skill enabled state', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const checkbox = document.querySelector('[data-skill-enabled="skill-one"]');
  assert.ok(checkbox);
  assert.equal(checkbox.checked, true);

  checkbox.checked = false;
  change(dom.window, checkbox);

  await waitUntil(() => calls.saves.length === 1 && !checkbox.disabled);
  assert.equal(calls.saves[0].templates[0].skills[0].enabled, false);
});

test('popup expands skill editor, saves edits, and collapses', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));

  const editor = document.getElementById('skillEditor');
  assert.equal(editor.hidden, false);
  document.getElementById('skillNameInput').value = 'Edited Skill';
  document.getElementById('skillContentInput').value = 'Edited content';
  click(dom.window, document.getElementById('skillDoneButton'));

  await waitUntil(() => calls.saves.length === 1 && editor.hidden);
  assert.equal(calls.saves[0].templates[0].skills[0].name, 'Edited Skill');
  assert.equal(calls.saves[0].templates[0].skills[0].content, 'Edited content');
});

test('popup deletes a skill from the current template', async (t) => {
  const { dom, calls } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));
  click(dom.window, document.getElementById('skillDeleteButton'));

  await waitUntil(() => calls.saves.length === 1 && document.getElementById('skillEditor').hidden);
  assert.deepEqual(calls.saves[0].templates[0].skills, []);
});

test('switching templates refreshes skills list and collapses editor', async (t) => {
  const { dom } = await createPopup({});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  click(dom.window, document.querySelector('[data-skill-edit="skill-one"]'));
  assert.equal(document.getElementById('skillEditor').hidden, false);

  const select = document.getElementById('templateSelect');
  select.value = 'two';
  change(dom.window, select);

  await waitUntil(() => document.getElementById('skillEditor').hidden);
  assert.equal(document.querySelector('[data-skill-enabled="skill-one"]'), null);
});
```

- [ ] **Step 3: Run popup tests to verify they fail**

Run:

```bash
npm test -- tests/popup-static.test.js tests/popup-behavior.test.js
```

Expected: FAIL because skill controls and behaviors do not exist.

- [ ] **Step 4: Add popup HTML**

In `src/popup/popup.html`, add this section after the template body field:

```html
      <section class="skills" aria-labelledby="skillsTitle">
        <div class="skillsHeader">
          <h2 id="skillsTitle">Skills</h2>
          <label class="fileButton">
            导入
            <input id="skillFileInput" type="file" accept=".md,.txt,text/markdown,text/plain">
          </label>
        </div>
        <div id="skillsList" class="skillsList" aria-live="polite"></div>
        <div id="skillEditor" class="skillEditor" hidden>
          <label class="field">
            <span>Skill 名称</span>
            <input id="skillNameInput" type="text" autocomplete="off">
          </label>
          <label class="field">
            <span>Skill 内容</span>
            <textarea id="skillContentInput" rows="7"></textarea>
          </label>
          <div class="skillEditorActions">
            <button id="skillDoneButton" type="button">完成</button>
            <button id="skillDeleteButton" type="button">删除 Skill</button>
          </div>
        </div>
      </section>
```

- [ ] **Step 5: Add popup CSS**

Append to `src/popup/popup.css`:

```css
.skills {
  margin-bottom: 10px;
}

.skillsHeader,
.skillRow,
.skillEditorActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skillsHeader {
  justify-content: space-between;
  margin-bottom: 6px;
}

h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
}

.fileButton {
  position: relative;
  overflow: hidden;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  padding: 6px 9px;
  font-size: 12px;
  cursor: pointer;
}

.fileButton input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.skillsList {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.skillRow {
  justify-content: space-between;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
  padding: 6px;
}

.skillRow label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
}

.skillRowName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skillRow button,
.skillEditorActions button {
  height: 28px;
  padding: 0 8px;
}

.skillEditor {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
}

#skillDeleteButton {
  color: #cf222e;
}
```

- [ ] **Step 6: Implement popup JavaScript**

In `src/popup/popup.js`, add element references:

```js
  const skillFileInput = document.getElementById('skillFileInput');
  const skillsList = document.getElementById('skillsList');
  const skillEditor = document.getElementById('skillEditor');
  const skillNameInput = document.getElementById('skillNameInput');
  const skillContentInput = document.getElementById('skillContentInput');
  const skillDoneButton = document.getElementById('skillDoneButton');
  const skillDeleteButton = document.getElementById('skillDeleteButton');
```

Add new controls to `controls`:

```js
  const controls = [
    select, enabledToggle, titleInput, bodyInput, saveButton, addButton,
    duplicateButton, deleteButton, skillFileInput, skillNameInput,
    skillContentInput, skillDoneButton, skillDeleteButton
  ];
```

Add state:

```js
  let editingSkillId = '';
```

Add helpers:

```js
  function createSkillId() {
    return `skill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  function parseSkillName(content) {
    const match = String(content || '').match(/^---\s*[\r\n]+[\s\S]*?^name:\s*["']?([^"'\r\n]+)["']?\s*$/m);
    return match && match[1] ? match[1].trim() : (KCP.DEFAULT_SKILL_NAME || '未命名 Skill');
  }

  function collapseSkillEditor() {
    editingSkillId = '';
    skillEditor.hidden = true;
    skillNameInput.value = '';
    skillContentInput.value = '';
  }

  function renderSkills() {
    skillsList.textContent = '';
    for (const skill of currentSkills()) {
      const row = document.createElement('div');
      row.className = 'skillRow';

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = skill.enabled !== false;
      checkbox.dataset.skillEnabled = skill.id;
      checkbox.addEventListener('change', () => {
        runAction('已更新 Skill', () => {
          updateCurrentFromInputs();
          skill.enabled = checkbox.checked;
        });
      });

      const name = document.createElement('span');
      name.className = 'skillRowName';
      name.textContent = skill.name || (KCP.DEFAULT_SKILL_NAME || '未命名 Skill');
      label.append(checkbox, name);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = '编辑';
      editButton.dataset.skillEdit = skill.id;
      editButton.addEventListener('click', () => {
        editingSkillId = skill.id;
        skillNameInput.value = skill.name || '';
        skillContentInput.value = skill.content || '';
        skillEditor.hidden = false;
        updateControls();
      });

      row.append(label, editButton);
      skillsList.append(row);
    }

    const editing = currentEditingSkill();
    if (!editing) {
      collapseSkillEditor();
    }
  }
```

Update `render()` to call:

```js
    renderSkills();
```

after setting `bodyInput.value`.

Update `updateControls()` so it disables dynamic skill row controls:

```js
    for (const control of skillsList.querySelectorAll('input, button')) {
      control.disabled = disabled;
    }
```

inside the function after the static controls loop.

Update template select action to collapse editor:

```js
      collapseSkillEditor();
      settings.activeTemplateId = selectedId;
```

Update add action template:

```js
      const template = {
        id: createId(),
        title: '新模板',
        body: '',
        skills: []
      };
```

Update duplicate action:

```js
      const template = KCP.cloneTemplateForDuplicate
        ? KCP.cloneTemplateForDuplicate(source, createId(), createSkillId)
        : {
          id: createId(),
          title: `${source.title} 副本`,
          body: source.body,
          skills: []
        };
```

Add file import event:

```js
  skillFileInput.addEventListener('change', async () => {
    const file = skillFileInput.files && skillFileInput.files[0];
    skillFileInput.value = '';
    if (!file || !settings || isSaving) return;

    let content = '';
    try {
      content = await file.text();
    } catch (_error) {
      setStatus('读取 Skill 失败');
      return;
    }

    runAction('已导入 Skill', () => {
      updateCurrentFromInputs();
      currentSkills().push({
        id: createSkillId(),
        name: parseSkillName(content),
        content,
        enabled: true
      });
    });
  });
```

Add editor actions:

```js
  skillDoneButton.addEventListener('click', () => {
    runAction('已保存 Skill', () => {
      updateCurrentFromInputs();
      const skill = currentEditingSkill();
      if (!skill) return;
      skill.name = skillNameInput.value.trim() || (KCP.DEFAULT_SKILL_NAME || '未命名 Skill');
      skill.content = skillContentInput.value;
      collapseSkillEditor();
    });
  });

  skillDeleteButton.addEventListener('click', () => {
    runAction('已删除 Skill', () => {
      updateCurrentFromInputs();
      const template = currentTemplate();
      if (!template) return;
      template.skills = currentSkills().filter((skill) => skill.id !== editingSkillId);
      collapseSkillEditor();
    });
  });
```

- [ ] **Step 7: Run popup tests to verify they pass**

Run:

```bash
npm test -- tests/popup-static.test.js tests/popup-behavior.test.js
```

Expected: PASS for popup static and behavior tests.

- [ ] **Step 8: Commit popup skill UI**

```bash
git add src/popup/popup.html src/popup/popup.css src/popup/popup.js tests/popup-static.test.js tests/popup-behavior.test.js
git commit -m "Add popup skill import and editing"
```

---

### Task 5: Full regression verification and release handoff

**Files:**

- Verify all changed files.
- No production code changes unless a previous task's full test run exposes an issue.

- [ ] **Step 1: Run full automated test suite**

Run:

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Inspect git diff**

Run from repository root:

```bash
git status --short --branch
git log --oneline -6
```

Expected:

- Working tree is clean.
- Recent commits include the design commit and the four implementation commits.

- [ ] **Step 3: Manual Chrome extension test**

Reload the unpacked extension from:

```text
/Users/hearmen/Project/AI4Sec/ai_generate/codex_wp/context-pinner/kimi-context-pinner
```

Manual checks:

1. Open the extension popup.
2. Confirm the Skills section appears below template content.
3. Import a local `SKILL.md`.
4. Confirm the skill appears checked in the list.
5. Click edit, change name/content, click completion, and confirm editor collapses.
6. Disable the skill checkbox and save.
7. Enable it again.
8. Open `https://chatgpt.com/`.
9. Enable automatic injection if it is off.
10. Send a test prompt.
11. Confirm the final editor content includes the active template body and enabled skill content before the original user input.

- [ ] **Step 4: Final commit only if manual-test notes require documentation**

If no documentation changes are needed, do not create an empty commit. If README testing notes are updated, run:

```bash
git add README.md
git commit -m "Document template skill testing"
```
