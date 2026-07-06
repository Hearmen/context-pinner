(function initActiveTab(root) {
  const KCP = root.KCP || {};

  KCP.refreshActiveSupportedTab = function refreshActiveSupportedTab() {
    if (!root.chrome || !root.chrome.tabs || typeof root.chrome.tabs.query !== 'function') {
      return Promise.reject(new Error('无法访问当前标签页'));
    }

    return new Promise((resolve, reject) => {
      root.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const queryError = root.chrome.runtime && root.chrome.runtime.lastError;
        if (queryError) {
          reject(new Error(queryError.message));
          return;
        }

        const tab = tabs && tabs[0];
        if (!tab || typeof tab.id !== 'number' || !KCP.getSupportedSite(tab.url)) {
          resolve(false);
          return;
        }

        root.chrome.tabs.reload(tab.id, () => {
          const reloadError = root.chrome.runtime && root.chrome.runtime.lastError;
          if (reloadError) {
            reject(new Error(reloadError.message));
            return;
          }
          resolve(true);
        });
      });
    });
  };

  root.KCP = KCP;
})(globalThis);
