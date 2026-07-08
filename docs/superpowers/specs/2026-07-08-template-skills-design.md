# Template Skills Design

## Goal

Each prompt template can maintain its own list of skills. Users can import skill files, enable or disable individual skills per template, edit imported skill names and content, and have the enabled skill content injected together with the active template before sending a message on supported sites.

This feature must preserve existing template behavior for users who do not configure skills.

## Data model

Template objects are extended from:

```js
{
  id: "...",
  title: "...",
  body: "..."
}
```

to:

```js
{
  id: "...",
  title: "...",
  body: "...",
  skills: [
    {
      id: "...",
      name: "skill-name",
      content: "...",
      enabled: true
    }
  ]
}
```

The extension does not persist a `fileName` or local filesystem path. Skill file import is a one-time read operation through the browser file picker. After import, the stored source of truth is the saved `name`, `content`, and `enabled` state.

Normalization rules:

- Existing templates without `skills` are normalized to `skills: []`.
- Invalid skill entries are discarded.
- `id`, `name`, and `content` are stored as strings.
- `enabled` defaults to `true` unless explicitly `false`.
- Empty skill names are replaced with a safe default such as `未命名 Skill`.

## Popup UI

The popup adds a Skills section directly below the template body textarea.

The section contains:

- A file input for importing skill files.
- A checkbox list showing skills owned by the current template.
- An edit button for each skill row.

Import behavior:

1. User selects a skill file.
2. Popup reads the file content immediately.
3. Popup tries to parse the frontmatter `name:` field as the skill name.
4. If no valid `name:` exists, popup uses `未命名 Skill`.
5. The skill is appended to the current template with `enabled: true`.
6. Settings are saved through the existing storage path.

Checkbox behavior:

- Checked skills are injected.
- Unchecked skills remain saved but are not injected.
- Toggling a checkbox saves the current template settings.

Editing behavior:

- Clicking a row's edit button expands an editor below the template body area.
- Only one skill editor is expanded at a time.
- The editor contains a skill name input, a skill content textarea, a completion button, and a delete button.
- Clicking completion saves the edited skill and collapses the editor.
- Deleting removes the skill from the current template and collapses the editor if that skill was active.

Template interactions:

- Switching templates refreshes the skill list and collapses any open skill editor.
- Adding a template starts with `skills: []`.
- Duplicating a template copies skills by value and generates new skill IDs so future edits are independent.
- Deleting a template deletes only that template's skills.

## Prompt injection

When automatic injection is enabled and the active template has enabled skills, the injected prompt includes the template body and the content of each enabled skill.

The format is:

```text
请按以下上下文处理用户输入。

上下文模板：
<template.body>

启用 Skills：
## <skill.name>
<skill.content>

## <skill.name>
<skill.content>

用户输入：
<original input>
```

If no skills are enabled, the existing behavior remains semantically the same: only the active template body is injected with the user input.

Duplicate wrapping prevention still uses the existing prompt marker. Already wrapped input is not wrapped again.

## Runtime flow

The content runtime continues to load normalized settings and resolve the active template. Instead of caching only the active template body, it caches the active template payload needed by prompt wrapping:

- template body
- enabled skills for the active template
- enabled global toggle state

Storage change listeners must treat `templates`, `activeTemplateId`, and `enabled` as relevant changes, as they do today. Skill edits are stored under `templates`, so no additional storage key is required.

## Error handling

- File read errors show a popup status message and do not modify saved settings.
- Invalid or empty skill files can still be imported as editable skills if they contain text; the fallback name is used.
- Empty skill content is saved but not injected, because injecting empty blocks adds noise without value.
- Storage failures use the existing rollback behavior.

## Testing

Storage tests:

- Old templates without `skills` normalize to `skills: []`.
- Valid skills are preserved.
- Invalid skill entries are filtered.
- Skill `enabled` defaults to `true`.
- Template duplication creates independent skill IDs.

Prompt tests:

- No skills preserves existing wrapping behavior.
- Enabled skill content is injected.
- Disabled skill content is not injected.
- Empty skill content is not injected.
- Existing wrapped input is not wrapped again.

Popup behavior tests:

- Importing a skill file creates a skill on the current template.
- Imported frontmatter `name:` is parsed.
- Checkbox toggles update the skill enabled state.
- Edit expands one skill editor.
- Completion saves edits and collapses the editor.
- Delete removes the skill from the current template.
- Switching templates refreshes the skill list and collapses editing state.

Runtime tests:

- The runtime reads enabled skills from the active template.
- Prompt wrapping receives the active template body plus enabled skills.
- Disabled extension state still prevents wrapping and indicator behavior remains unchanged.

## Out of scope

- Persisting local file paths.
- Re-reading local skill files after initial import.
- Native Messaging integration.
- File System Access API handles.
- Global skill libraries shared across templates.
- Syncing skill content from external sources.
