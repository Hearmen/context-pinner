(function initSites(root) {
  const KCP = root.KCP || {};

  KCP.SUPPORTED_SITES = [
    {
      id: 'kimi',
      name: 'Kimi',
      indicatorText: '● Context 已开启',
      matches(url) {
        return url.origin === 'https://www.kimi.com';
      }
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      indicatorText: '● Context 已开启',
      matches(url) {
        return url.origin === 'https://chatgpt.com';
      }
    }
  ];

  KCP.getSupportedSite = function getSupportedSite(rawUrl) {
    if (typeof rawUrl !== 'string') return null;

    let url;
    try {
      url = new URL(rawUrl);
    } catch (_error) {
      return null;
    }

    return KCP.SUPPORTED_SITES.find((site) => site.matches(url)) || null;
  };

  root.KCP = KCP;
})(globalThis);
