const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function loadIndicator(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  globalThis.KCP = {};

  delete require.cache[require.resolve('../src/content/indicator.js')];
  require('../src/content/indicator.js');

  return { dom, KCP: globalThis.KCP };
}

function pointerEvent(dom, type, options = {}) {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    button: options.button ?? 0,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  return event;
}

function setViewport(dom, width, height) {
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: height });
}

test('syncEnabledIndicator creates one status indicator and updates its text', () => {
  const { KCP } = loadIndicator();

  const first = KCP.syncEnabledIndicator(true);
  assert.equal(first.textContent, '● Context 已开启');
  const second = KCP.syncEnabledIndicator(true, '● Custom status');

  assert.equal(first, second);
  assert.equal(document.querySelectorAll('#kcp-enabled-indicator').length, 1);
  assert.equal(first.getAttribute('role'), 'status');
  assert.equal(first.textContent, '● Custom status');
  assert.equal(first.style.position, 'fixed');
  assert.equal(first.style.pointerEvents, 'auto');
  assert.equal(first.style.touchAction, 'none');
});

test('syncEnabledIndicator removes the indicator when disabled', () => {
  const { KCP } = loadIndicator();
  KCP.syncEnabledIndicator(true);

  const result = KCP.syncEnabledIndicator(false);

  assert.equal(result, null);
  assert.equal(document.querySelector('#kcp-enabled-indicator'), null);
});

test('syncEnabledIndicator safely returns null without a body', () => {
  const { KCP } = loadIndicator();
  document.body.remove();

  assert.equal(KCP.syncEnabledIndicator(true), null);
});

test('pointer drag uses client deltas and clamps the indicator to viewport bounds', () => {
  const { dom, KCP } = loadIndicator();
  setViewport(dom, 300, 200);
  const indicator = KCP.syncEnabledIndicator(true);
  indicator.getBoundingClientRect = () => ({ left: 220, top: 130, width: 80, height: 40 });
  let captured = null;
  indicator.setPointerCapture = (pointerId) => { captured = pointerId; };

  indicator.dispatchEvent(pointerEvent(dom, 'pointerdown', { clientX: 240, clientY: 150, pointerId: 7 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointermove', { clientX: 500, clientY: 500, pointerId: 7 }));

  assert.equal(captured, 7);
  assert.equal(indicator.style.right, 'auto');
  assert.equal(indicator.style.left, '220px');
  assert.equal(indicator.style.top, '160px');
  assert.equal(indicator.style.cursor, 'grabbing');
});

test('pointer drag ignores non-primary buttons and removes temporary listeners on pointerup', () => {
  const { dom, KCP } = loadIndicator();
  setViewport(dom, 400, 300);
  const indicator = KCP.syncEnabledIndicator(true);
  indicator.getBoundingClientRect = () => ({ left: 100, top: 80, width: 60, height: 30 });
  let released = null;
  indicator.releasePointerCapture = (pointerId) => { released = pointerId; };

  indicator.dispatchEvent(pointerEvent(dom, 'pointerdown', { button: 2, clientX: 100, clientY: 80 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointermove', { clientX: 150, clientY: 130 }));
  assert.equal(indicator.style.left, '');

  indicator.dispatchEvent(pointerEvent(dom, 'pointerdown', { clientX: 100, clientY: 80, pointerId: 3 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointerup', { clientX: 120, clientY: 100, pointerId: 3 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointermove', { clientX: 250, clientY: 200, pointerId: 3 }));

  assert.equal(released, 3);
  assert.equal(indicator.style.left, '100px');
  assert.equal(indicator.style.top, '80px');
  assert.equal(indicator.style.cursor, 'grab');
});

test('resize clamps a dragged indicator and the resize listener is bound only once', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  globalThis.KCP = {};
  let resizeBindings = 0;
  const originalAddEventListener = dom.window.addEventListener.bind(dom.window);
  dom.window.addEventListener = (type, listener, options) => {
    if (type === 'resize') resizeBindings += 1;
    return originalAddEventListener(type, listener, options);
  };
  delete require.cache[require.resolve('../src/content/indicator.js')];
  require('../src/content/indicator.js');

  setViewport(dom, 500, 400);
  let indicator = globalThis.KCP.syncEnabledIndicator(true);
  indicator.getBoundingClientRect = () => ({ left: 350, top: 300, width: 100, height: 50 });
  indicator.dispatchEvent(pointerEvent(dom, 'pointerdown', { clientX: 350, clientY: 300 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointermove', { clientX: 390, clientY: 330 }));
  dom.window.dispatchEvent(pointerEvent(dom, 'pointerup', { pointerId: 1 }));

  setViewport(dom, 320, 220);
  indicator.getBoundingClientRect = () => ({ left: 390, top: 330, width: 100, height: 50 });
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(indicator.style.left, '220px');
  assert.equal(indicator.style.top, '170px');

  indicator.style.left = '0px';
  indicator.style.top = '0px';
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(indicator.style.left, '0px');
  assert.equal(indicator.style.top, '0px');

  globalThis.KCP.syncEnabledIndicator(false);
  indicator = globalThis.KCP.syncEnabledIndicator(true);
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(indicator.style.left, '');
  assert.equal(resizeBindings, 1);
});
