const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('src/popup/active-tab.js', 'utf8');

function loadWith(chrome, getSupportedSite = (url) => url.startsWith('https://www.kimi.com/')) {
  const context = { chrome, URL, KCP: { getSupportedSite } };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.KCP.refreshActiveSupportedTab;
}

test('reloads the active supported Kimi tab', async () => {
  const reloaded = [];
  const chrome = {
    runtime: {},
    tabs: {
      query(queryInfo, callback) {
        assert.equal(queryInfo.active, true);
        assert.equal(queryInfo.currentWindow, true);
        callback([{ id: 42, url: 'https://www.kimi.com/chat/abc' }]);
      },
      reload(tabId, callback) {
        reloaded.push(tabId);
        callback();
      }
    }
  };

  assert.equal(await loadWith(chrome)(), true);
  assert.deepEqual(reloaded, [42]);
});

test('does not reload an unsupported active tab', async () => {
  let reloadCount = 0;
  const chrome = {
    runtime: {},
    tabs: {
      query(_queryInfo, callback) {
        callback([{ id: 7, url: 'https://example.com/' }]);
      },
      reload() {
        reloadCount += 1;
      }
    }
  };

  assert.equal(await loadWith(chrome)(), false);
  assert.equal(reloadCount, 0);
});

test('rejects with the tab query runtime error', async () => {
  const chrome = {
    runtime: {},
    tabs: {
      query(_queryInfo, callback) {
        chrome.runtime.lastError = { message: 'query failed' };
        callback([]);
        delete chrome.runtime.lastError;
      }
    }
  };

  await assert.rejects(loadWith(chrome)(), /query failed/);
});

test('rejects when tabs access is unavailable', async () => {
  await assert.rejects(loadWith({ runtime: {} })(), /无法访问当前标签页/);
});

test('returns false for a missing tab or non-numeric tab id', async () => {
  for (const tabs of [[], [{ url: 'https://www.kimi.com/' }]]) {
    const chrome = {
      runtime: {},
      tabs: { query(_queryInfo, callback) { callback(tabs); } }
    };
    assert.equal(await loadWith(chrome)(), false);
  }
});

test('rejects with the tab reload runtime error', async () => {
  const chrome = {
    runtime: {},
    tabs: {
      query(_queryInfo, callback) {
        callback([{ id: 42, url: 'https://www.kimi.com/' }]);
      },
      reload(_tabId, callback) {
        chrome.runtime.lastError = { message: 'reload failed' };
        callback();
        delete chrome.runtime.lastError;
      }
    }
  };

  await assert.rejects(loadWith(chrome)(), /reload failed/);
});

test('rejects when reload is unavailable after an asynchronous query', async () => {
  const chrome = {
    runtime: {},
    tabs: {
      query(_queryInfo, callback) {
        setImmediate(() => callback([{ id: 42, url: 'https://www.kimi.com/' }]));
      }
    }
  };

  await assert.rejects(loadWith(chrome)(), /无法刷新当前标签页/);
});

test('does not reload invalid numeric tab ids', async () => {
  for (const id of [NaN, Infinity, 1.5, -1]) {
    let reloadCount = 0;
    const chrome = {
      runtime: {},
      tabs: {
        query(_queryInfo, callback) {
          callback([{ id, url: 'https://www.kimi.com/' }]);
        },
        reload() {
          reloadCount += 1;
        }
      }
    };

    assert.equal(await loadWith(chrome)(), false);
    assert.equal(reloadCount, 0);
  }
});
