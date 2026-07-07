# ChatGPT Adapter Design

## Goal

Extend Context Pinner's complete template injection workflow to `https://chatgpt.com/*` while preserving Kimi behavior and establishing a provider-adapter architecture for future chat sites.

## Scope

This release will:

- Rename the extension from `Kimi Context Pinner` to `Context Pinner`.
- Support Kimi at `https://www.kimi.com/*` and ChatGPT at `https://chatgpt.com/*`.
- Share templates, active template, and enabled state across both sites.
- Show the existing draggable enabled indicator on both supported sites.
- Refresh only the current active supported tab after a successful toggle change.
- Inject the active template before Enter-send and send-button actions on ChatGPT.

This release will not:

- Support `https://chat.openai.com/*`.
- Add Doubao or another provider.
- Call ChatGPT APIs.
- Hide the injected context from the visible conversation.
- Introduce per-site templates or per-site enabled state.

## Architecture

### Shared content runtime

Extract provider-neutral behavior from the current Kimi content script into a shared content runtime. The runtime accepts one site adapter and owns:

- settings loading and active-template caching;
- request-version protection against stale asynchronous settings loads;
- enabled-indicator synchronization and delayed-body recovery;
- relevant `chrome.storage.sync` change handling;
- document-level capture for Enter and send-button clicks;
- dynamic DOM rebinding after single-page application updates;
- prompt wrapping and duplicate-injection protection;
- fail-safe behavior that never blocks the site's normal send action.

The runtime must not contain Kimi or ChatGPT selectors. It communicates through a small adapter interface:

```js
{
  id,
  findEditor(),
  findSendButton(),
  readEditorText(editor),
  replaceEditorText(editor, text)
}
```

The runtime exposes only the test and startup surface needed by both content entries. Each provider content entry constructs its adapter and starts the shared runtime.

### Kimi adapter

Move Kimi-specific selector and editor-update behavior into a Kimi adapter without changing its observable behavior. It retains:

- `.chat-input-editor[contenteditable=true]` and role/textbox fallback lookup;
- send-icon and send-button-container lookup;
- the main-world page bridge for Lexical updates;
- the existing Lexical, `execCommand`, DOM, and input/change fallbacks.

The existing Kimi regression suite must continue to pass after extraction.

### ChatGPT adapter

Add a ChatGPT adapter with resilient, narrowly scoped DOM lookup:

- Editor primary selector: `#prompt-textarea[contenteditable=true]`.
- Editor fallback: a visible contenteditable ProseMirror editor inside the current composer/form.
- Send primary selector: `button[data-testid="send-button"]`.
- Send fallback: the enabled submit button associated with the editor's nearest composer form.

Text replacement focuses the editor, selects its current contents, and uses `document.execCommand('insertText', false, text)` where available. It then verifies the visible editor text and applies a controlled DOM fallback if necessary. It dispatches bubbling `input` and `change` events so ChatGPT's frontend observes the update.

If the editor, send button, selection API, or replacement mechanism is unavailable, the adapter returns failure and the runtime allows the original send behavior to continue unchanged.

### Site registry and manifest

Add a ChatGPT entry to the existing site registry:

```js
{
  id: 'chatgpt',
  name: 'ChatGPT',
  indicatorText: '● Context 已开启',
  matches(url) {
    return url.origin === 'https://chatgpt.com';
  }
}
```

The manifest adds only `https://chatgpt.com/*` to host permissions and a ChatGPT content-script entry. It keeps Kimi's main-world bridge limited to Kimi. ChatGPT receives shared defaults, prompt, storage, site registry, indicator, shared runtime, and ChatGPT adapter scripts in dependency order.

The popup continues using `getSupportedSite()`, so current-tab refresh works for ChatGPT without provider branches.

## Event Flow

1. The provider content entry starts the shared runtime with its adapter.
2. The runtime loads the shared settings and synchronizes the enabled indicator.
3. On Enter without Shift or composition, or on a click within the adapter's current send button, the runtime reads the editor text.
4. When enabled and the active template is nonblank, the runtime calls the existing prompt wrapper.
5. If the text is not already wrapped, the runtime asks the adapter to replace it before later site handlers read the event.
6. The original event continues to the site; the extension does not synthesize a second send.

Shift+Enter remains a newline. Composition Enter remains untouched. Duplicate capture paths remain safe because the prompt marker prevents a second wrap.

## Error Handling

- Missing or changed ChatGPT selectors result in no modification, not a blocked send.
- A failed editor replacement leaves the original input usable.
- Stale settings requests cannot overwrite a newer enabled state or active template.
- Storage load failures are caught and retain the last valid cached state.
- DOM observer callbacks are idempotent and must not create duplicate listeners or indicators.
- Unsupported, malformed, lookalike, HTTP, and non-default-port ChatGPT URLs are rejected by the registry.

## Branding

Update manifest action title, extension name, description, popup heading, and README references to the provider-neutral `Context Pinner`. Existing package and source directory names may remain unchanged to avoid unrelated repository churn.

## Testing

Automated tests cover:

- strict ChatGPT registry matching and lookalike rejection;
- manifest ChatGPT permission and content-script dependency order;
- shared runtime enabled/disabled, settings races, delayed body, storage filtering, Enter/click capture, Shift+Enter, composition, and duplicate protection;
- Kimi adapter editor/send lookup and replacement regression behavior;
- ChatGPT primary and fallback editor/send lookup;
- ChatGPT editor replacement and input/change events;
- ChatGPT Enter and click paths wrap before later page handlers observe the input;
- popup refresh recognizes ChatGPT as a supported active tab;
- all existing storage, prompt, popup, indicator, and Kimi behavior remains green.

Manual verification loads the unpacked extension, tests the full toggle/indicator/injection workflow independently on Kimi and ChatGPT, verifies the indicator can be dragged and resets after refresh, and confirms unsupported pages do not refresh.

## Extensibility

A future provider adds one site-registry entry, manifest permission/content-script entry, and provider adapter. It should not modify the shared runtime, popup orchestration, settings model, prompt wrapper, or indicator component unless the shared contract itself changes.
