# Draggable Enabled Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a draggable enabled-state capsule on Kimi and reload only the current active supported tab after a successful toggle change.

**Architecture:** Add a provider-neutral site registry, active-tab refresh helper, and page-indicator component. The popup composes registry and refresh helpers after saving, while the Kimi content script composes settings and indicator behavior without embedding future-provider assumptions.

**Tech Stack:** Chrome Manifest V3, plain JavaScript IIFEs on `globalThis.KCP`, `chrome.storage.sync`, `chrome.tabs`, Node `node:test`, jsdom.

---

## File Structure

- Create `kimi-context-pinner/src/shared/sites.js`: supported-site registry and URL lookup.
- Create `kimi-context-pinner/src/popup/active-tab.js`: refresh the active tab only when its URL is registered.
- Create `kimi-context-pinner/src/content/indicator.js`: idempotent indicator rendering, removal, dragging, and viewport clamping.
- Create `kimi-context-pinner/tests/sites.test.js`: registry URL matching tests.
- Create `kimi-context-pinner/tests/active-tab.test.js`: active-tab query/reload tests.
- Create `kimi-context-pinner/tests/indicator.test.js`: indicator lifecycle and dragging tests.
- Modify `kimi-context-pinner/manifest.json`: add `activeTab` and load new shared/content scripts.
- Modify `kimi-context-pinner/src/popup/popup.html`: load site and active-tab helpers.
- Modify `kimi-context-pinner/src/popup/popup.js`: refresh after a successful toggle save only.
- Modify `kimi-context-pinner/src/content/content.js`: synchronize the indicator from loaded settings.
- Modify `kimi-context-pinner/tests/popup-static.test.js`: verify helper loading and toggle wiring.

### Task 1: Supported-Site Registry

**Files:**
- Create: `kimi-context-pinner/tests/sites.test.js`
- Create: `kimi-context-pinner/src/shared/sites.js`
- Modify: `kimi-context-pinner/manifest.json`
- Modify: `kimi-context-pinner/src/popup/popup.html`

- [ ] **Step 1: Write the failing registry tests**

```js
const assert = require('node:assert/strict');
const test = require('node:test');

function loadSites() {
  globalThis.KCP = {};
  delete require.cache[require.resolve('../src/shared/sites.js')];
  require('../src/shared/sites.js');
  return globalThis.KCP;
}

test('getSupportedSite recognizes Kimi HTTPS pages', () => {
  const KCP = loadSites();
  assert.equal(KCP.getSupportedSite('https://www.kimi.com/chat/abc').id, 'kimi');
});

test('getSupportedSite rejects unsupported and malformed URLs', () => {
  const KCP = loadSites();
  assert.equal(KCP.getSupportedSite('https://chatgpt.com/'), null);
  assert.equal(KCP.getSupportedSite('not a url'), null);
  assert.equal(KCP.getSupportedSite(undefined), null);
});
```

- [ ] **Step 2: Run the registry tests and verify RED**

Run: `cd kimi-context-pinner && npm test -- tests/sites.test.js`

Expected: FAIL because `src/shared/sites.js` does not exist.

- [ ] **Step 3: Implement the registry**

```js
(function attachSites(root) {
  const KCP = root.KCP || {};
  const sites = [{
    id: 'kimi',
    name: 'Kimi',
    indicatorText: '● Context 已开启',
    matches(url) {
      return url.protocol === 'https:' && url.hostname === 'www.kimi.com';
    }
  }];

  function getSupportedSite(rawUrl) {
    if (typeof rawUrl !== 'string') return null;
    try {
      const url = new URL(rawUrl);
      return sites.find((site) => site.matches(url)) || null;
    } catch (error) {
      return null;
    }
  }

  KCP.SUPPORTED_SITES = sites;
  KCP.getSupportedSite = getSupportedSite;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 4: Load the registry in extension contexts**

In `manifest.json`, add `"activeTab"` to `permissions`, load `src/shared/sites.js` before the content modules, and load `src/content/indicator.js` before `src/content/content.js`. In `popup.html`, load `../shared/sites.js` and `./active-tab.js` before `popup.js`.

- [ ] **Step 5: Run the registry tests and manifest JSON check**

Run: `cd kimi-context-pinner && npm test -- tests/sites.test.js && node -e "JSON.parse(require('node:fs').readFileSync('manifest.json'))"`

Expected: registry tests PASS and JSON parsing exits 0.

- [ ] **Step 6: Commit**

```bash
git add kimi-context-pinner/src/shared/sites.js kimi-context-pinner/tests/sites.test.js kimi-context-pinner/manifest.json kimi-context-pinner/src/popup/popup.html
git commit -m "Add extensible supported-site registry"
```

### Task 2: Active Supported Tab Refresh

**Files:**
- Create: `kimi-context-pinner/tests/active-tab.test.js`
- Create: `kimi-context-pinner/src/popup/active-tab.js`
- Modify: `kimi-context-pinner/tests/popup-static.test.js`
- Modify: `kimi-context-pinner/src/popup/popup.js`

- [ ] **Step 1: Write failing active-tab tests**

```js
const assert = require('node:assert/strict');
const test = require('node:test');

function loadHelper(activeTab, queryError = null, reloadError = null) {
  globalThis.KCP = {
    getSupportedSite(url) {
      return typeof url === 'string' && url.startsWith('https://www.kimi.com/') ? { id: 'kimi' } : null;
    }
  };
  const reloaded = [];
  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      query(query, callback) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        globalThis.chrome.runtime.lastError = queryError ? { message: queryError } : null;
        callback(activeTab ? [activeTab] : []);
        globalThis.chrome.runtime.lastError = null;
      },
      reload(tabId, callback) {
        reloaded.push(tabId);
        globalThis.chrome.runtime.lastError = reloadError ? { message: reloadError } : null;
        callback();
        globalThis.chrome.runtime.lastError = null;
      }
    }
  };
  delete require.cache[require.resolve('../src/popup/active-tab.js')];
  require('../src/popup/active-tab.js');
  return { KCP: globalThis.KCP, reloaded };
}

test('refreshActiveSupportedTab reloads the current Kimi tab', async () => {
  const { KCP, reloaded } = loadHelper({ id: 42, url: 'https://www.kimi.com/chat/a' });
  assert.equal(await KCP.refreshActiveSupportedTab(), true);
  assert.deepEqual(reloaded, [42]);
});

test('refreshActiveSupportedTab ignores unsupported active tabs', async () => {
  const { KCP, reloaded } = loadHelper({ id: 7, url: 'https://example.com/' });
  assert.equal(await KCP.refreshActiveSupportedTab(), false);
  assert.deepEqual(reloaded, []);
});

test('refreshActiveSupportedTab rejects Chrome tab errors', async () => {
  const { KCP } = loadHelper({ id: 42, url: 'https://www.kimi.com/' }, 'query failed');
  await assert.rejects(KCP.refreshActiveSupportedTab(), /query failed/);
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `cd kimi-context-pinner && npm test -- tests/active-tab.test.js`

Expected: FAIL because `src/popup/active-tab.js` does not exist.

- [ ] **Step 3: Implement active-tab refresh**

```js
(function attachActiveTab(root) {
  const KCP = root.KCP || {};

  function refreshActiveSupportedTab() {
    if (!root.chrome || !root.chrome.tabs) {
      return Promise.reject(new Error('无法访问当前标签页'));
    }
    return new Promise((resolve, reject) => {
      root.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const queryError = root.chrome.runtime && root.chrome.runtime.lastError;
        if (queryError) return reject(new Error(queryError.message));
        const tab = tabs && tabs[0];
        if (!tab || typeof tab.id !== 'number' || !KCP.getSupportedSite(tab.url)) {
          resolve(false);
          return;
        }
        root.chrome.tabs.reload(tab.id, () => {
          const reloadError = root.chrome.runtime && root.chrome.runtime.lastError;
          if (reloadError) return reject(new Error(reloadError.message));
          resolve(true);
        });
      });
    });
  }

  KCP.refreshActiveSupportedTab = refreshActiveSupportedTab;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `cd kimi-context-pinner && npm test -- tests/active-tab.test.js`

Expected: all active-tab tests PASS.

- [ ] **Step 5: Add popup wiring assertions before production wiring**

Extend `popup-static.test.js` to assert that `popup.html` loads `sites.js` and `active-tab.js`, and that `popup.js` contains `refreshActiveSupportedTab` in the enabled-toggle path.

Run: `cd kimi-context-pinner && npm test -- tests/popup-static.test.js`

Expected: FAIL because the toggle does not call the helper.

- [ ] **Step 6: Refresh only after a successful toggle save**

Change `runAction` to accept an options object. Immediately after `lastSavedSettings = cloneSettings(settings)`, run:

```js
if (options && options.refreshActiveTab) {
  await KCP.refreshActiveSupportedTab();
}
```

Call the toggle action with `{ refreshActiveTab: true }`. Do not pass that option from save, select, add, duplicate, or delete actions. Existing catch/restore behavior must not roll back a setting merely because refresh failed; split save failures from post-save refresh failures and show `刷新失败` while retaining the normalized saved state.

- [ ] **Step 7: Run popup and helper tests**

Run: `cd kimi-context-pinner && npm test -- tests/active-tab.test.js tests/popup-static.test.js`

Expected: all selected tests PASS.

- [ ] **Step 8: Commit**

```bash
git add kimi-context-pinner/src/popup/active-tab.js kimi-context-pinner/src/popup/popup.js kimi-context-pinner/tests/active-tab.test.js kimi-context-pinner/tests/popup-static.test.js
git commit -m "Reload active supported tab after toggle"
```

### Task 3: Draggable Page Indicator

**Files:**
- Create: `kimi-context-pinner/tests/indicator.test.js`
- Create: `kimi-context-pinner/src/content/indicator.js`

- [ ] **Step 1: Write failing indicator lifecycle tests**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadIndicator() {
  const dom = new JSDOM('<html><body></body></html>', { url: 'https://www.kimi.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  globalThis.KCP = {};
  delete require.cache[require.resolve('../src/content/indicator.js')];
  require('../src/content/indicator.js');
  return { dom, KCP: globalThis.KCP };
}

test('syncEnabledIndicator creates one enabled indicator', () => {
  const { KCP } = loadIndicator();
  KCP.syncEnabledIndicator(true, '● Context 已开启');
  KCP.syncEnabledIndicator(true, '● Context 已开启');
  assert.equal(document.querySelectorAll('#kcp-enabled-indicator').length, 1);
  assert.equal(document.querySelector('#kcp-enabled-indicator').textContent, '● Context 已开启');
});

test('syncEnabledIndicator removes the indicator when disabled', () => {
  const { KCP } = loadIndicator();
  KCP.syncEnabledIndicator(true, '● Context 已开启');
  KCP.syncEnabledIndicator(false);
  assert.equal(document.querySelector('#kcp-enabled-indicator'), null);
});
```

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `cd kimi-context-pinner && npm test -- tests/indicator.test.js`

Expected: FAIL because `indicator.js` does not exist.

- [ ] **Step 3: Implement indicator lifecycle and styles**

```js
(function attachIndicator(root) {
  const KCP = root.KCP || {};
  const INDICATOR_ID = 'kcp-enabled-indicator';

  function syncEnabledIndicator(enabled, text) {
    let indicator = document.getElementById(INDICATOR_ID);
    if (!enabled) {
      if (indicator) indicator.remove();
      return null;
    }
    if (!document.body) return null;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = INDICATOR_ID;
      indicator.setAttribute('role', 'status');
      Object.assign(indicator.style, {
        position: 'fixed', top: '56px', right: '24px', zIndex: '2147483647',
        padding: '7px 11px', borderRadius: '999px', background: '#16a34a',
        color: '#fff', font: '600 12px/1.4 system-ui, sans-serif',
        boxShadow: '0 3px 10px rgba(0,0,0,.18)', cursor: 'grab',
        touchAction: 'none', userSelect: 'none'
      });
      document.body.append(indicator);
    }
    indicator.textContent = text || '● Context 已开启';
    return indicator;
  }

  KCP.syncEnabledIndicator = syncEnabledIndicator;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

Run: `cd kimi-context-pinner && npm test -- tests/indicator.test.js`

Expected: lifecycle tests PASS.

- [ ] **Step 5: Add failing drag and clamp tests**

Append:

```js
test('pointer drag moves and clamps the indicator inside the viewport', () => {
  const { dom, KCP } = loadIndicator();
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 300 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 200 });
  KCP.syncEnabledIndicator(true, '● Context 已开启');
  const indicator = document.querySelector('#kcp-enabled-indicator');
  indicator.getBoundingClientRect = () => ({ left: 240, top: 20, width: 80, height: 30 });

  indicator.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 250, clientY: 30 }));
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 250 }));
  dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));

  assert.equal(indicator.style.left, '220px');
  assert.equal(indicator.style.top, '170px');
});

test('resize clamps a dragged indicator back into view', () => {
  const { dom, KCP } = loadIndicator();
  KCP.syncEnabledIndicator(true, '● Context 已开启');
  const indicator = document.querySelector('#kcp-enabled-indicator');
  indicator.style.left = '500px';
  indicator.style.top = '400px';
  indicator.getBoundingClientRect = () => ({ left: 500, top: 400, width: 80, height: 30 });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 300 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 200 });

  dom.window.dispatchEvent(new dom.window.Event('resize'));

  assert.equal(indicator.style.left, '220px');
  assert.equal(indicator.style.top, '170px');
});
```

- [ ] **Step 6: Run drag tests and verify RED**

Run: `cd kimi-context-pinner && npm test -- tests/indicator.test.js`

Expected: FAIL because pointer movement is not implemented.

- [ ] **Step 7: Implement pointer dragging and resize clamping**

Replace `indicator.js` with:

```js
(function attachIndicator(root) {
  const KCP = root.KCP || {};
  const INDICATOR_ID = 'kcp-enabled-indicator';
  let resizeBound = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function clampPosition(indicator, left, top) {
    const rect = indicator.getBoundingClientRect();
    indicator.style.right = 'auto';
    indicator.style.left = `${clamp(left, 0, root.window.innerWidth - rect.width)}px`;
    indicator.style.top = `${clamp(top, 0, root.window.innerHeight - rect.height)}px`;
  }

  function beginDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const indicator = event.currentTarget;
    const rect = indicator.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    indicator.style.cursor = 'grabbing';
    if (indicator.setPointerCapture && event.pointerId !== undefined) {
      indicator.setPointerCapture(event.pointerId);
    }

    function move(moveEvent) {
      clampPosition(
        indicator,
        startLeft + moveEvent.clientX - startX,
        startTop + moveEvent.clientY - startY
      );
    }

    function end(endEvent) {
      indicator.style.cursor = 'grab';
      if (indicator.releasePointerCapture && endEvent.pointerId !== undefined) {
        try { indicator.releasePointerCapture(endEvent.pointerId); } catch (error) {}
      }
      root.window.removeEventListener('pointermove', move);
      root.window.removeEventListener('pointerup', end);
      root.window.removeEventListener('pointercancel', end);
    }

    root.window.addEventListener('pointermove', move);
    root.window.addEventListener('pointerup', end);
    root.window.addEventListener('pointercancel', end);
  }

  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    root.window.addEventListener('resize', () => {
      const indicator = document.getElementById(INDICATOR_ID);
      if (!indicator || !indicator.style.left) return;
      const rect = indicator.getBoundingClientRect();
      clampPosition(indicator, rect.left, rect.top);
    });
  }

  function syncEnabledIndicator(enabled, text) {
    let indicator = document.getElementById(INDICATOR_ID);
    if (!enabled) {
      if (indicator) indicator.remove();
      return null;
    }
    if (!document.body) return null;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = INDICATOR_ID;
      indicator.setAttribute('role', 'status');
      Object.assign(indicator.style, {
        position: 'fixed', top: '56px', right: '24px', zIndex: '2147483647',
        padding: '7px 11px', borderRadius: '999px', background: '#16a34a',
        color: '#fff', font: '600 12px/1.4 system-ui, sans-serif',
        boxShadow: '0 3px 10px rgba(0,0,0,.18)', cursor: 'grab',
        touchAction: 'none', userSelect: 'none'
      });
      indicator.addEventListener('pointerdown', beginDrag);
      document.body.append(indicator);
    }
    indicator.textContent = text || '● Context 已开启';
    bindResize();
    return indicator;
  }

  KCP.syncEnabledIndicator = syncEnabledIndicator;
  root.KCP = KCP;
})(globalThis);
```

- [ ] **Step 8: Run indicator tests and verify GREEN**

Run: `cd kimi-context-pinner && npm test -- tests/indicator.test.js`

Expected: all indicator tests PASS.

- [ ] **Step 9: Commit**

```bash
git add kimi-context-pinner/src/content/indicator.js kimi-context-pinner/tests/indicator.test.js
git commit -m "Add draggable enabled page indicator"
```

### Task 4: Content-Script Integration and Regression Verification

**Files:**
- Modify: `kimi-context-pinner/tests/content-dom.test.js`
- Modify: `kimi-context-pinner/src/content/content.js`
- Modify: `kimi-context-pinner/README.md`

- [ ] **Step 1: Add failing content integration tests**

Load `indicator.js` before `content.js` in the test fixture. Stub `KCP.syncEnabledIndicator`, resolve `loadSettings()` with enabled and disabled settings, call `refreshActiveTemplate()`, and assert the helper receives the setting and Kimi registry text.

- [ ] **Step 2: Run content tests and verify RED**

Run: `cd kimi-context-pinner && npm test -- tests/content-dom.test.js`

Expected: FAIL because `refreshActiveTemplate()` does not synchronize the indicator.

- [ ] **Step 3: Synchronize the indicator from settings**

In `refreshActiveTemplate()`, resolve the current site through `KCP.getSupportedSite(document.location.href)`, set the cached enabled value, and call:

```js
KCP.syncEnabledIndicator(
  cachedEnabled,
  site ? site.indicatorText : '● Context 已开启'
);
```

Keep missing helpers non-fatal for isolated tests and fail-safe browser behavior.

- [ ] **Step 4: Run content tests and verify GREEN**

Run: `cd kimi-context-pinner && npm test -- tests/content-dom.test.js`

Expected: all content tests PASS.

- [ ] **Step 5: Document the behavior**

Update the extension README to state that enabled Kimi pages display a draggable upper-right indicator, its position resets on refresh, and toggling reloads only the active supported page.

- [ ] **Step 6: Run the complete automated suite**

Run: `cd kimi-context-pinner && npm test`

Expected: all tests PASS with no warnings or unhandled rejections.

- [ ] **Step 7: Validate packaging and changes**

Run: `cd kimi-context-pinner && node -e "JSON.parse(require('node:fs').readFileSync('manifest.json'))" && git diff --check`

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add kimi-context-pinner/src/content/content.js kimi-context-pinner/tests/content-dom.test.js kimi-context-pinner/README.md
git commit -m "Show enabled indicator on supported pages"
```

### Task 5: Manual Acceptance

**Files:** None.

- [ ] **Step 1: Reload the unpacked extension in Chrome**

Open `chrome://extensions`, reload Kimi Context Pinner, and open a Kimi page.

- [ ] **Step 2: Verify enabled behavior**

Turn automatic injection on. Confirm the current Kimi tab reloads exactly once, one green capsule appears in the upper-right, injection still wraps a sent message, and the capsule can be dragged without blocking Kimi controls.

- [ ] **Step 3: Verify reset and disabled behavior**

Refresh after dragging and confirm the capsule returns to the upper-right. Turn injection off and confirm the current Kimi tab reloads exactly once and the capsule is absent.

- [ ] **Step 4: Verify unsupported-page behavior**

Open the popup on a non-Kimi tab, change the toggle, and confirm the setting saves without refreshing that tab.

- [ ] **Step 5: Record final status**

Run: `git status --short --branch`

Expected: the implementation commits are present and the worktree is clean.
