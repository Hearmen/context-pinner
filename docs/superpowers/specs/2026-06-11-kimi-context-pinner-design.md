# Kimi Context Pinner Design

## Goal

Build a Chrome Manifest V3 extension that helps the user keep a reusable prompt context when using Kimi at `https://www.kimi.com/`. The first version focuses on sending each user message with the currently selected context template, without requiring the user to manually paste the prompt every time.

## Scope

The extension will:

- Match only `https://www.kimi.com/*`.
- Provide a browser action popup for selecting and editing templates.
- Store templates and the active template in `chrome.storage.sync`.
- Intercept Kimi send actions from the page content script.
- Rewrite the current Kimi input before the message is sent.

The extension will not:

- Call Kimi APIs directly.
- Hide the injected context from the visible chat history.
- Build an in-page template toolbar in the first version.
- Support other Kimi domains unless added later.

## Kimi Page Findings

The current `https://www.kimi.com/` page uses a contenteditable chat input:

- Input selector: `.chat-input-editor[contenteditable=true][role=textbox]`
- Editor container: `.chat-editor`
- Send icon: `.chat-editor .send-icon`
- Clickable send parent: `.send-button-container`

These selectors are implementation details of the current Kimi page and may change. The content script should treat them as best-effort selectors and fail quietly if the page changes.

## User Experience

The popup is the primary UI. It contains:

- A template selector.
- An editor for the selected template title and body.
- Actions to add, save, duplicate, and delete templates.
- A clear active/inactive state.

The default templates are:

- `双向翻译`: judge the input language; translate Chinese to English and English to Chinese; output only the translation.
- `英文润色`: polish English while preserving meaning; output only the polished version.
- `摘要整理`: summarize or organize the input into concise structured notes.

When the user sends a Kimi message, the content script wraps the original input as:

```text
<active template body>

用户输入：
<original input>
```

If no active template exists, the active template is empty, or the editor is empty, the content script does not modify the message.

## Architecture

The extension consists of a small set of focused files:

- `manifest.json`: Chrome MV3 permissions, host match, popup, and content script configuration.
- `src/shared/defaults.js`: built-in templates and storage keys.
- `src/shared/storage.js`: storage load/save helpers with default initialization.
- `src/shared/prompt.js`: pure prompt wrapping and duplicate detection helpers.
- `src/content/content.js`: Kimi DOM binding, send interception, and editor rewriting.
- `src/popup/popup.html`: popup structure.
- `src/popup/popup.css`: popup styling.
- `src/popup/popup.js`: template management UI.
- `tests/*.test.js`: unit tests for pure helpers and light DOM behavior.

The content script depends on the shared prompt and storage helpers. The popup depends on storage helpers. Prompt formatting stays in `src/shared/prompt.js` so it can be tested without a browser page.

## Data Model

Template data stored in `chrome.storage.sync`:

```json
{
  "templates": [
    {
      "id": "translate-bilingual",
      "title": "双向翻译",
      "body": "..."
    }
  ],
  "activeTemplateId": "translate-bilingual"
}
```

Template IDs are stable strings. Built-in template IDs are fixed. User-created IDs can use a timestamp plus random suffix.

## Send Interception

The content script binds to:

- `click` events on the nearest send button container.
- `keydown` events on the editor when `Enter` is pressed without `Shift`.

Before the event reaches Kimi's app handlers, the script:

1. Finds `.chat-input-editor[contenteditable=true]`.
2. Reads `innerText`.
3. Loads the active template from storage.
4. Builds the wrapped prompt.
5. Replaces the editor content using `document.execCommand('insertText', false, wrappedText)` when possible.
6. Dispatches `input` and `change` events so Kimi's frontend state sees the new text.
7. Allows the original send action to continue.

If content replacement fails, the script stops modifying and lets Kimi handle the original message. It should not block normal Kimi use.

## Duplicate Protection

Wrapped messages include an internal marker in the text:

```text
[Kimi Context Pinner]
```

The prompt helper treats any input containing this marker near the beginning as already wrapped and returns it unchanged. This prevents double wrapping when both keydown and click paths fire for the same message.

The marker is visible in the sent message. This is acceptable for version one because it keeps behavior transparent and makes duplicate detection reliable. A later version could use a less visible format if needed.

## Error Handling

The extension should fail quietly:

- If Kimi selectors are missing, do nothing.
- If Chrome storage is unavailable, fall back to built-in defaults for the current page session.
- If the selected template is missing, use the first available template.
- If the template body is blank, do not wrap.
- If the user deletes the active template, select the first remaining template or disable wrapping if none remain.

A small status line in the popup can show save/load failures. The content script should avoid noisy alerts or console spam.

## Testing

Use focused tests for behavior that is independent of Chrome extension packaging:

- `wrapPrompt` wraps original input with the active template.
- `wrapPrompt` does not wrap empty template or empty input.
- `wrapPrompt` does not double-wrap marked input.
- Storage initialization returns built-in templates when storage is empty.
- Storage normalization handles a missing active template.
- Content DOM helper can locate the contenteditable editor and send button from a small HTML fixture.

Manual verification:

- Load the unpacked extension in Chrome.
- Open `https://www.kimi.com/`.
- Select a template in the popup.
- Type a test message.
- Confirm the editor is rewritten before send.
- Confirm Shift+Enter still inserts a newline.
- Confirm disabling or blanking the active template leaves messages unchanged.

## Open Risks

- Kimi may change class names or send behavior. The extension should isolate selector logic in the content script so it is easy to update.
- Programmatic contenteditable updates must trigger Kimi's frontend input state. The implementation should use the same style of update as browser automation: focus, select, insert text, then dispatch input-like events.
- The visible marker and prompt wrapper add noise to chat history. This is a conscious first-version tradeoff for reliability and transparency.
