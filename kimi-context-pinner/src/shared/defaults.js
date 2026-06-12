(function attachDefaults(root) {
  const KCP = root.KCP || {};

  KCP.STORAGE_KEYS = {
    templates: 'templates',
    activeTemplateId: 'activeTemplateId',
    enabled: 'enabled'
  };

  KCP.DEFAULT_TEMPLATES = [
    {
      id: 'translate-bilingual',
      title: '双向翻译',
      body: '请判断我输入的语言：如果是中文，翻译成英文；如果是英文，翻译成中文。只输出译文，不要解释。'
    },
    {
      id: 'polish-english',
      title: '英文润色',
      body: '请将用户输入的英文润色为自然、清晰、专业的表达，保持原意。只输出润色后的英文。'
    },
    {
      id: 'summarize-notes',
      title: '摘要整理',
      body: '请将用户输入整理为简洁、结构化的摘要。保留关键事实、结论和行动项。'
    }
  ];

  root.KCP = KCP;
})(globalThis);
