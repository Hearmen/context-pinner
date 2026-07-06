(function attachEnabledIndicator(root) {
  const KCP = root.KCP || {};
  const INDICATOR_ID = 'kcp-enabled-indicator';
  const DEFAULT_TEXT = '● Context 已开启';
  const view = document.defaultView || root.window || root;
  let stopActiveDrag = null;

  function clamp(value, maximum) {
    return Math.min(Math.max(value, 0), Math.max(maximum, 0));
  }

  function setDraggedPosition(indicator, left, top, width, height) {
    indicator.style.right = 'auto';
    indicator.style.left = `${clamp(left, view.innerWidth - width)}px`;
    indicator.style.top = `${clamp(top, view.innerHeight - height)}px`;
    indicator.__kcpWasDragged = true;
  }

  function safelyCallPointerMethod(indicator, method, pointerId) {
    if (typeof indicator[method] !== 'function') return;
    try {
      indicator[method](pointerId);
    } catch (error) {
      // Pointer capture can throw when the pointer is no longer active.
    }
  }

  function bindDrag(indicator) {
    indicator.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (stopActiveDrag) stopActiveDrag();

      const rect = indicator.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      indicator.style.cursor = 'grabbing';
      setDraggedPosition(indicator, rect.left, rect.top, rect.width, rect.height);
      safelyCallPointerMethod(indicator, 'setPointerCapture', pointerId);

      function onMove(moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        setDraggedPosition(
          indicator,
          rect.left + moveEvent.clientX - startX,
          rect.top + moveEvent.clientY - startY,
          rect.width,
          rect.height
        );
      }

      function cleanup(endEvent) {
        if (endEvent && endEvent.pointerId !== pointerId) return;
        view.removeEventListener('pointermove', onMove);
        view.removeEventListener('pointerup', cleanup);
        view.removeEventListener('pointercancel', cleanup);
        indicator.style.cursor = 'grab';
        safelyCallPointerMethod(indicator, 'releasePointerCapture', pointerId);
        stopActiveDrag = null;
      }

      stopActiveDrag = cleanup;
      view.addEventListener('pointermove', onMove);
      view.addEventListener('pointerup', cleanup);
      view.addEventListener('pointercancel', cleanup);
    });
  }

  function clampDraggedIndicatorOnResize() {
    const indicator = document.getElementById(INDICATOR_ID);
    if (!indicator || !indicator.__kcpWasDragged || !indicator.style.left) return;
    const rect = indicator.getBoundingClientRect();
    const parsedLeft = Number.parseFloat(indicator.style.left);
    const parsedTop = Number.parseFloat(indicator.style.top);
    const left = Number.isFinite(parsedLeft) ? parsedLeft : rect.left;
    const top = Number.isFinite(parsedTop) ? parsedTop : rect.top;
    setDraggedPosition(indicator, left, top, rect.width, rect.height);
  }

  view.addEventListener('resize', clampDraggedIndicatorOnResize);

  function applyIndicatorStyles(indicator) {
    Object.assign(indicator.style, {
      position: 'fixed',
      top: '56px',
      right: '24px',
      padding: '8px 14px',
      background: '#16a34a',
      color: '#ffffff',
      borderRadius: '9999px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)',
      zIndex: '2147483647',
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
      pointerEvents: 'auto'
    });
  }

  function syncEnabledIndicator(enabled, text) {
    const existing = document.getElementById(INDICATOR_ID);
    if (!enabled) {
      if (stopActiveDrag) stopActiveDrag();
      if (existing) existing.remove();
      return null;
    }
    if (!document.body) return null;

    const indicator = existing || document.createElement('div');
    if (!existing) {
      indicator.id = INDICATOR_ID;
      indicator.setAttribute('role', 'status');
      applyIndicatorStyles(indicator);
      bindDrag(indicator);
      document.body.appendChild(indicator);
    }
    indicator.textContent = text || DEFAULT_TEXT;
    return indicator;
  }

  KCP.syncEnabledIndicator = syncEnabledIndicator;
  root.KCP = KCP;
})(globalThis);
