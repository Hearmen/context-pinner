# Context Pinner

Browser extension workspace for Context Pinner, a Chrome MV3 extension that prepends editable context templates to messages on Kimi and ChatGPT.

Supported sites:

- `https://www.kimi.com/`
- `https://chatgpt.com/`

Both sites share the same templates, active template, and enabled setting.

## Project Layout

- `kimi-context-pinner/` - extension source, manifest, popup UI, content scripts, tests, and icons.
- `docs/` - design and implementation notes used while building the extension.

## Develop

```bash
cd kimi-context-pinner
npm install
npm test
```

## Load The Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `kimi-context-pinner` directory.
5. Open either supported site.
6. Use the extension popup to choose or edit the active context template.

The active template is prepended before sending with Enter or the send button. Shift+Enter remains a newline. When enabled, a draggable indicator appears on supported pages. Changing the enable toggle reloads only the current active tab when it is a supported page.
