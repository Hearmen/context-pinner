# Context Pinner

Browser extension workspace for Kimi Context Pinner, a Chrome MV3 extension that prepends editable context templates to messages on `https://www.kimi.com/`.

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
5. Open `https://www.kimi.com/`.
6. Use the extension popup to choose or edit the active context template.

The active template is prepended before sending with Enter or the send button. Shift+Enter remains a newline.
