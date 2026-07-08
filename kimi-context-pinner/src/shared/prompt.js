(function attachPrompt(root) {
  const KCP = root.KCP || {};
  const HEADER = '请按以下上下文处理用户输入。';

  function isWrapped(input) {
    return typeof input === 'string' && input.trimStart().startsWith(HEADER);
  }

  function normalizePromptPayload(source) {
    if (typeof source === 'string') {
      return { body: source, skills: [] };
    }

    const body = source && typeof source === 'object' ? String(source.body || '') : '';
    const rawSkills = source && typeof source === 'object' && Array.isArray(source.skills) ? source.skills : [];
    const skills = rawSkills
      .filter((skill) => skill && skill.enabled !== false && String(skill.content || '').trim() !== '')
      .map((skill) => ({
        name: String(skill.name || '').trim() || '未命名 Skill',
        content: String(skill.content || '').trim(),
      }));

    return { body, skills };
  }

  function buildPrompt(payload, originalInput) {
    const body = payload.body.trim();
    const lines = [
      HEADER,
      '',
      '上下文模板：',
      body,
      '',
    ];

    if (payload.skills.length > 0) {
      lines.push('启用 Skills：');
      payload.skills.forEach((skill, index) => {
        if (index > 0) {
          lines.push('');
        }
        lines.push(`## ${skill.name}`, skill.content);
      });
      lines.push('');
    }

    lines.push('用户输入：', originalInput);
    return lines.join('\n');
  }

  function wrapPrompt(template, originalInput) {
    if (typeof originalInput !== 'string' || originalInput.trim() === '') {
      return originalInput;
    }

    const payload = normalizePromptPayload(template);

    if (payload.body.trim() === '' && payload.skills.length === 0) {
      return originalInput;
    }

    if (isWrapped(originalInput)) {
      return originalInput;
    }

    return buildPrompt(payload, originalInput);
  }

  KCP.PROMPT_MARKER = HEADER;
  KCP.isWrapped = isWrapped;
  KCP.wrapPrompt = wrapPrompt;
  root.KCP = KCP;
})(globalThis);
