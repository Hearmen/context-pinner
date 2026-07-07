# ChatGPT Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full template injection support for `https://chatgpt.com/*` through a shared content runtime and provider-specific adapters while preserving Kimi behavior.

**Architecture:** Extract settings, indicator, event capture, and prompt wrapping into a provider-neutral runtime that consumes a four-operation adapter. Keep Kimi's Lexical bridge and selectors in a Kimi adapter, add a contenteditable ChatGPT adapter, and register both sites through the existing popup and manifest infrastructure.

**Tech Stack:** Chrome Manifest V3, plain JavaScript IIFEs on `globalThis.KCP`, `chrome.storage.sync`, jsdom, Node `node:test`.

---

## File Structure

- Create `kimi-context-pinner/src/content/runtime.js`: shared settings, indicator, capture, observer, and wrapping lifecycle.
- Create `kimi-context-pinner/src/sites/kimi.js`: Kimi selectors and Lexical-aware editor replacement adapter.
- Create `kimi-context-pinner/src/sites/chatgpt.js`: ChatGPT composer selectors and contenteditable replacement adapter.
- Create `kimi-context-pinner/tests/runtime.test.js`: provider-neutral runtime behavior and race tests.
- Create `kimi-context-pinner/tests/kimi-adapter.test.js`: Kimi adapter lookup and replacement regression tests.
- Create `kimi-context-pinner/tests/chatgpt-adapter.test.js`: ChatGPT lookup, replacement, and send-path tests.
- Modify `kimi-context-pinner/src/shared/sites.js`: register strict ChatGPT origin.
- Modify `kimi-context-pinner/manifest.json`: provider-neutral branding, ChatGPT permission, and provider script entries.
- Modify `kimi-context-pinner/src/popup/popup.html`: provider-neutral heading.
- Modify `kimi-context-pinner/tests/sites.test.js`: ChatGPT registry boundaries.
- Modify `kimi-context-pinner/tests/content-dom.test.js`: retire Kimi monolith assumptions in favor of adapter/runtime suites.
- Modify `kimi-context-pinner/tests/popup-behavior.test.js`: verify ChatGPT is treated as supported by active-tab refresh.
- Modify `kimi-context-pinner/tests/popup-static.test.js`: verify provider-neutral branding and dependencies.
- Modify `README.md` and `kimi-context-pinner/README.md`: document Kimi and ChatGPT support.
- Delete `kimi-context-pinner/src/content/content.js` after its behavior is fully represented by runtime and Kimi adapter tests.

### Task 1: Extract the Provider-Neutral Runtime

**Files:**
- Create: `kimi-context-pinner/src/content/runtime.js`
- Create: `kimi-context-pinner/tests/runtime.test.js`

- [ ] **Step 1: Write failing runtime lifecycle tests**

Build a jsdom fixture with a fake adapter and fake `KCP.loadSettings`, `getActiveTemplate`, `wrapPrompt`, and `syncEnabledIndicator`. Test that `KCP.createContentRuntime(adapter)` exists and that `refreshActiveTemplate()` synchronizes enabled state and the supplied site indicator text.

```js
test('runtime loads settings and synchronizes the provider indicator', async () => {
  const { KCP, calls } = loadRuntime('<html><body></body></html>');
  const runtime = KCP.createContentRuntime(fakeAdapter());
  await runtime.refreshActiveTemplate();
  assert.deepEqual(calls.indicator, [[true, '● Context 已开启']]);
});
```

- [ ] **Step 2: Verify lifecycle RED**

Run: `cd kimi-context-pinner && node --test tests/runtime.test.js`

Expected: FAIL because `createContentRuntime` is undefined.

- [ ] **Step 3: Implement the runtime lifecycle**

Create an IIFE that exports `KCP.createContentRuntime(adapter)`. Validate that the adapter has `findEditor`, `findSendButton`, `readEditorText`, and `replaceEditorText`. Move the existing cached settings, `hasLoadedSettings`, request-version protection, `syncCachedIndicator`, storage filtering, delayed-body observer recovery, and safe rejected-promise handling into the returned runtime instance. Resolve indicator text through `KCP.getSupportedSite(document.location.href)`.

The returned public surface is:

```js
{
  refreshActiveTemplate,
  wrapCurrentEditorInput,
  bindProviderDom,
  start,
  setCachedTemplateBodyForTest,
  setEnabledForTest
}
```

- [ ] **Step 4: Verify lifecycle GREEN**

Run: `cd kimi-context-pinner && node --test tests/runtime.test.js`

Expected: lifecycle tests PASS.

- [ ] **Step 5: Add failing event and race tests**

Add tests using the fake adapter for:

- Enter without Shift wraps before a later target handler reads text.
- Shift+Enter and composing Enter do not wrap.
- Click inside the current send button wraps once.
- Marker duplicate protection prevents a second replacement.
- A settings request that resolves late cannot overwrite a newer request.
- Body insertion after settings load causes the missing indicator to be retried.
- Only relevant `sync` storage changes trigger refresh.

Use deferred promises for request ordering and synchronous event handlers for capture ordering; do not use arbitrary sleeps.

- [ ] **Step 6: Verify event/race RED**

Run: `cd kimi-context-pinner && node --test tests/runtime.test.js`

Expected: the newly added event/race assertions FAIL until capture and observer behavior is implemented.

- [ ] **Step 7: Implement runtime event capture and observer binding**

Use unique document/editor/button bound attributes. Capture `keydown` and `click` on `document` before site handlers. Determine editor/send membership through the adapter. Read text, check cached enabled/template state, call `KCP.wrapPrompt`, and call `adapter.replaceEditorText` only when wrapping changes the text. MutationObserver callbacks call `bindProviderDom()` and `syncCachedIndicator()` idempotently.

- [ ] **Step 8: Verify Task 1**

Run: `cd kimi-context-pinner && node --test tests/runtime.test.js && git diff --check`

Expected: all runtime tests PASS and diff check exits 0.

- [ ] **Step 9: Commit**

```bash
git add kimi-context-pinner/src/content/runtime.js kimi-context-pinner/tests/runtime.test.js
git commit -m "Extract provider-neutral content runtime"
```

### Task 2: Move Kimi Behavior Into an Adapter

**Files:**
- Create: `kimi-context-pinner/src/sites/kimi.js`
- Create: `kimi-context-pinner/tests/kimi-adapter.test.js`
- Modify: `kimi-context-pinner/tests/content-dom.test.js`
- Delete: `kimi-context-pinner/src/content/content.js`
- Modify: `kimi-context-pinner/manifest.json`

- [ ] **Step 1: Write failing Kimi adapter tests**

Move selector/replacement expectations from `content-dom.test.js` into `kimi-adapter.test.js`. The tests must assert:

```js
assert.equal(KCP.createKimiAdapter().findEditor().innerText, 'hello');
assert.equal(KCP.createKimiAdapter().findSendButton().className, 'send-button-container');
assert.equal(adapter.replaceEditorText(editor, 'new'), true);
```

Retain tests for page-bridge success, Lexical state replacement, delayed Lexical DOM sync, `execCommand` fallback, and input event dispatch.

- [ ] **Step 2: Verify adapter RED**

Run: `cd kimi-context-pinner && node --test tests/kimi-adapter.test.js`

Expected: FAIL because `src/sites/kimi.js` does not exist.

- [ ] **Step 3: Implement the Kimi adapter**

Move Kimi-only functions from `content.js` into `createKimiAdapter()`:

```js
{
  id: 'kimi',
  findEditor,
  findSendButton,
  readEditorText(editor) {
    return editor.innerText || editor.textContent || '';
  },
  replaceEditorText
}
```

Keep page bridge event names and result attributes unchanged. Make `replaceEditorText` return a boolean result while retaining existing focus, Lexical, selection, `execCommand`, DOM fallback, and input/change dispatch behavior.

At module startup, when not under `__KCP_TEST__`, call:

```js
KCP.createContentRuntime(KCP.createKimiAdapter()).start();
```

- [ ] **Step 4: Change Kimi manifest dependency order**

For Kimi's isolated-world content entry, load shared modules, `indicator.js`, `runtime.js`, then `sites/kimi.js`. Keep `page-bridge.js` in its Kimi-only MAIN-world entry. Remove `content.js` from the manifest and delete it after tests use the adapter/runtime.

- [ ] **Step 5: Verify Kimi GREEN and regressions**

Run: `cd kimi-context-pinner && node --test tests/kimi-adapter.test.js tests/runtime.test.js tests/content-dom.test.js && npm test`

Expected: Kimi adapter/runtime tests and the complete suite PASS.

- [ ] **Step 6: Commit**

```bash
git add kimi-context-pinner/src/sites/kimi.js kimi-context-pinner/src/content/runtime.js kimi-context-pinner/manifest.json kimi-context-pinner/tests/kimi-adapter.test.js kimi-context-pinner/tests/content-dom.test.js
git rm kimi-context-pinner/src/content/content.js
git commit -m "Move Kimi integration to site adapter"
```

### Task 3: Add the ChatGPT Adapter

**Files:**
- Create: `kimi-context-pinner/src/sites/chatgpt.js`
- Create: `kimi-context-pinner/tests/chatgpt-adapter.test.js`

- [ ] **Step 1: Write failing ChatGPT selector tests**

Cover primary and fallback editor/send lookup with realistic fixtures:

```html
<form data-type="unified-composer">
  <div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p>Hello</p></div>
  <button type="submit" data-testid="send-button">Send</button>
</form>
```

Verify the primary ID/test ID path and a fallback form with a visible `.ProseMirror[contenteditable=true]` plus enabled `button[type=submit]`. Reject disabled submit buttons and unrelated contenteditable elements outside the composer.

- [ ] **Step 2: Verify selectors RED**

Run: `cd kimi-context-pinner && node --test tests/chatgpt-adapter.test.js`

Expected: FAIL because `createChatGPTAdapter` is undefined.

- [ ] **Step 3: Implement ChatGPT lookup and text reading**

Export `KCP.createChatGPTAdapter()` with `id: 'chatgpt'`. Scope fallback lookup to the editor's nearest `form` or composer container. `readEditorText` returns `innerText || textContent || ''` with jsdom fallback support.

- [ ] **Step 4: Add failing replacement tests**

Verify replacement focuses the editor, selects all contents, uses `execCommand('insertText')` when available, confirms the final visible text, falls back to controlled `textContent` replacement, and dispatches one bubbling `input` plus one `change` event. Verify a missing editor returns false without throwing.

- [ ] **Step 5: Verify replacement RED**

Run: `cd kimi-context-pinner && node --test tests/chatgpt-adapter.test.js`

Expected: replacement tests FAIL until replacement is implemented.

- [ ] **Step 6: Implement ChatGPT replacement and startup**

Use selection/range APIs and `document.execCommand('insertText', false, text)`. If insertion is unavailable or visible text does not equal the requested text, replace editor children with a paragraph containing the text. Dispatch `InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })` and `Event('change', { bubbles: true })`. Return true only after the visible text matches. Start the shared runtime outside tests.

- [ ] **Step 7: Add runtime integration tests for ChatGPT**

Using ChatGPT fixtures and the real runtime/adapter, verify Enter and send-button capture wrap the editor before later page handlers read it, Shift+Enter is unchanged, and one user action produces one wrapper marker.

- [ ] **Step 8: Verify Task 3**

Run: `cd kimi-context-pinner && node --test tests/chatgpt-adapter.test.js tests/runtime.test.js && npm test`

Expected: all ChatGPT, runtime, and complete tests PASS.

- [ ] **Step 9: Commit**

```bash
git add kimi-context-pinner/src/sites/chatgpt.js kimi-context-pinner/tests/chatgpt-adapter.test.js
git commit -m "Add ChatGPT site adapter"
```

### Task 4: Register ChatGPT and Update Branding

**Files:**
- Modify: `kimi-context-pinner/src/shared/sites.js`
- Modify: `kimi-context-pinner/tests/sites.test.js`
- Modify: `kimi-context-pinner/manifest.json`
- Modify: `kimi-context-pinner/src/popup/popup.html`
- Modify: `kimi-context-pinner/tests/popup-behavior.test.js`
- Modify: `kimi-context-pinner/tests/popup-static.test.js`
- Modify: `README.md`
- Modify: `kimi-context-pinner/README.md`

- [ ] **Step 1: Add failing registry and manifest tests**

Assert `https://chatgpt.com/` and arbitrary paths resolve to site ID `chatgpt`. Reject HTTP, subdomains, lookalikes, non-default ports, and `chat.openai.com`. Parse the manifest and assert ChatGPT host permission plus a ChatGPT content script that loads shared modules, indicator, runtime, and `sites/chatgpt.js` in dependency order. Assert Kimi's MAIN-world bridge remains Kimi-only.

- [ ] **Step 2: Verify registry/manifest RED**

Run: `cd kimi-context-pinner && node --test tests/sites.test.js tests/popup-static.test.js`

Expected: ChatGPT registry and manifest assertions FAIL.

- [ ] **Step 3: Register ChatGPT and update manifest**

Append the strict-origin ChatGPT registry entry from the design. Add `https://chatgpt.com/*` to host permissions and add an isolated-world ChatGPT content entry with dependency order:

```json
[
  "src/shared/sites.js",
  "src/shared/defaults.js",
  "src/shared/prompt.js",
  "src/shared/storage.js",
  "src/content/indicator.js",
  "src/content/runtime.js",
  "src/sites/chatgpt.js"
]
```

Rename manifest name/action title to `Context Pinner`, update the description to mention supported AI chat sites, and change popup heading to `Context Pinner`.

- [ ] **Step 4: Add Popup ChatGPT refresh behavior test**

Drive the existing popup behavior fixture with an active tab URL under `https://chatgpt.com/`; toggle enabled and assert the tab refresh helper is invoked after save. Keep unsupported-page behavior unchanged.

- [ ] **Step 5: Verify integration GREEN**

Run: `cd kimi-context-pinner && node --test tests/sites.test.js tests/popup-static.test.js tests/popup-behavior.test.js && npm test`

Expected: all selected and complete tests PASS.

- [ ] **Step 6: Update documentation**

Update both READMEs to call the extension `Context Pinner`, list Kimi and ChatGPT supported URLs, and describe shared templates, the draggable indicator, active-supported-tab refresh, and unpacked loading steps.

- [ ] **Step 7: Validate packaging**

Run:

```bash
cd kimi-context-pinner
node -e "const m=JSON.parse(require('node:fs').readFileSync('manifest.json')); if (!m.host_permissions.includes('https://chatgpt.com/*')) process.exit(1)"
npm test
git diff --check
```

Expected: JSON validation, complete tests, and diff check all exit 0.

- [ ] **Step 8: Commit**

```bash
git add README.md kimi-context-pinner/README.md kimi-context-pinner/manifest.json kimi-context-pinner/src/shared/sites.js kimi-context-pinner/src/popup/popup.html kimi-context-pinner/tests/sites.test.js kimi-context-pinner/tests/popup-static.test.js kimi-context-pinner/tests/popup-behavior.test.js
git commit -m "Register ChatGPT support and update branding"
```

### Task 5: Manual Acceptance

**Files:** None.

- [ ] **Step 1: Reload the unpacked extension**

Open `chrome://extensions`, reload Context Pinner, and confirm Chrome displays the new provider-neutral name without manifest errors.

- [ ] **Step 2: Verify Kimi regression behavior**

On `https://www.kimi.com/`, toggle injection, confirm one active-tab refresh, drag the indicator, and send one test message through Enter and one through the send button.

- [ ] **Step 3: Verify ChatGPT behavior**

On `https://chatgpt.com/`, toggle injection, confirm one active-tab refresh and the enabled indicator, drag it, then verify Enter and the send button each send exactly one visibly wrapped message. Verify Shift+Enter inserts a newline.

- [ ] **Step 4: Verify unsupported-page behavior**

On an unsupported page, toggle the setting and confirm it saves without refreshing that page.

- [ ] **Step 5: Record final state**

Run: `git status --short --branch`

Expected: implementation commits are present and the worktree is clean.
