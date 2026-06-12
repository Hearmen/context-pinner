(function attachPrompt(root) {
  const KCP = root.KCP || {};
  const HEADER = '请按以下上下文处理用户输入。上下文模板：';

  function isWrapped(input) {
    return typeof input === 'string' && input.trimStart().startsWith(HEADER);
  }

  function wrapPrompt(templateBody, originalInput) {
    if (typeof originalInput !== 'string' || originalInput.trim() === '') {
      return originalInput;
    }

    if (typeof templateBody !== 'string' || templateBody.trim() === '') {
      return originalInput;
    }

    if (isWrapped(originalInput)) {
      return originalInput;
    }

    return `${HEADER}${templateBody.trim()}用户输入：${originalInput}`;
  }

  KCP.PROMPT_MARKER = HEADER;
  KCP.isWrapped = isWrapped;
  KCP.wrapPrompt = wrapPrompt;
  root.KCP = KCP;
})(globalThis);
