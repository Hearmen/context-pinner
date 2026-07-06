# Kimi Context Pinner

Chrome MV3 extension for `https://www.kimi.com/`.

## Develop

```bash
npm install
npm test
```

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `kimi-context-pinner` directory.
5. Open `https://www.kimi.com/`.
6. Choose or edit a template from the extension popup.

The active template is prepended to messages when clicking Kimi's send button or pressing Enter. Shift+Enter remains a newline.

When context injection is enabled, supported Kimi pages show a draggable indicator in the upper-right corner. Its position resets after the page is refreshed.

Changing the enable toggle refreshes only the currently active supported site so the page state updates immediately. On unsupported pages, the setting is still saved, but the page is not refreshed.
