// Focused local smoke test for the M1 personal and administration navigation surfaces.
// Launch an isolated Chromium-compatible browser on port 9223 and Expo on port 8081 first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const target = targets.find((entry) => entry.type === 'page');
  assert.ok(target, 'Open an isolated browser tab first');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const callback = pending.get(data.id);
    if (!callback) return;
    pending.delete(data.id);
    data.error ? callback.reject(data.error) : callback.resolve(data.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(key, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Not found: ${expression}`);
  };
  const navigateHome = async () => {
    await send('Page.navigate', { url: 'http://127.0.0.1:8081/' });
    await waitFor("!!document.querySelector('[aria-label=\"Mis publicaciones\"]')");
  };
  const click = async (label) => {
    const encoded = JSON.stringify(label);
    const matches = `(node.getAttribute('aria-label') || node.textContent).trim() === ${encoded}`;
    await waitFor(`Array.from(document.querySelectorAll('[role="button"]')).some((node) => ${matches})`);
    await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find((node) => ${matches}).click()`);
  };
  const screenshot = async (name) => {
    const output = path.join(__dirname, '../../context/tasks/FRONTEND-M1-NAVIGATION-TILES/screenshots');
    fs.mkdirSync(output, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
  };

  try {
    await send('Page.enable');
    for (const width of [320, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await navigateHome();
      assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false, `Horizontal overflow at ${width}px`);
      assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[role=tab]')).map((node) => node.getAttribute('aria-label'))"), ['Inicio', 'Mapa', 'Marketplace', 'Biblioteca']);
      assert.equal(await evaluate(`(() => {
        const labels = ['Mis publicaciones', 'Mis solicitudes', 'Mis transacciones', 'Mis recursos'];
        const rects = labels.map((label) => document.querySelector('[aria-label="' + label + '"]').getBoundingClientRect());
        return Math.abs(rects[0].width - rects[1].width) < 1 && Math.abs(rects[0].height - rects[1].height) < 1 && Math.abs(rects[2].height - rects[3].height) < 1;
      })()`), true, `Uneven tile grid at ${width}px`);
      await evaluate("Array.from(document.querySelectorAll('*')).find((node) => node.children.length === 0 && node.textContent === 'Tu CampusLink').scrollIntoView({ block: 'start' })");
      await screenshot(`home-tiles-${width}`);
    }

    const routes = [
      ['Mis publicaciones', '/placeholder/publicaciones'],
      ['Mis solicitudes', '/placeholder/solicitudes'],
      ['Mis transacciones', '/placeholder/transacciones'],
      ['Mis recursos', '/placeholder/recursos'],
      ['Mis actividades', '/placeholder/mis-actividades'],
      ['Moderación', '/placeholder/moderacion'],
      ['Usuarios', '/placeholder/usuarios'],
      ['Analítica', '/placeholder/analitica'],
      ['Reportes', '/placeholder/reportes'],
    ];
    for (const [label, route] of routes) {
      await navigateHome();
      await click(label);
      await waitFor(`location.pathname === ${JSON.stringify(route)}`);
      assert.equal(await evaluate("document.querySelectorAll('[role=tab]').length"), 4, `Bottom navigation missing on ${route}`);
    }

    await navigateHome();
    await click('Crear actividad');
    await waitFor("location.pathname === '/create/activity'");
    assert.equal(await evaluate("document.querySelectorAll('[role=tab]').length"), 0, 'Creation flow should retain its existing full-screen behavior');
    console.log('PASS: 320/390px tile grid, no overflow, four bottom tabs, nine preserved placeholder routes, and existing create-activity route.');
  } finally {
    ws.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
