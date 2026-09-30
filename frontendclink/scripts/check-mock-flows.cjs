// Local smoke test; launch an isolated headless Chrome on port 9223 and Expo on 8081.
// Uses the browser's DevTools protocol, with no additional npm dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const target = targets.find((entry) => entry.type === 'page' && (entry.url === 'about:blank' || entry.url.startsWith('http://localhost:8081')));
  assert.ok(target, 'Open an isolated blank browser tab first');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => { const data = JSON.parse(event.data); const callback = pending.get(data.id); if (callback) { pending.delete(data.id); data.error ? callback.reject(data.error) : callback.resolve(data.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(`Not found: ${expression}\n${await evaluate('document.body.innerText')}`);
  };
  const visibleText = (text) => waitFor(`document.body && document.body.innerText.includes(${JSON.stringify(text)})`);
  const click = async (label, role = 'button') => {
    const selector = `[role="${role}"]`;
    await waitFor(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e => e.getClientRects().length && !e.closest('[aria-hidden="true"]')).some(e => (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(label)})`);
    await evaluate(`(() => { const e = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e => e.getClientRects().length && !e.closest('[aria-hidden="true"]')).find(e => (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(label)}); e.scrollIntoView({block:'center'}); e.click(); })()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const e = Array.from(document.querySelectorAll('input[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + '],textarea[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']')).find(e => e.getClientRects().length && !e.closest('[aria-hidden="true"]')); if (!e) throw Error('Missing input'); e.focus(); e.select(); })()`);
    await send('Input.insertText', { text: value });
  };
  const navigate = async (route) => { await send('Page.navigate', { url: `http://localhost:8081${route}` }); };
  const screenshot = async (name) => {
    const directory = path.join(__dirname, '../../context/tasks/FRONTEND-M1-M6-mockup/screenshots');
    fs.mkdirSync(directory, { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate('/'); await visibleText('Hola, Alex');
    if (process.argv.includes('--inspect')) { console.log(await evaluate('document.body.innerText')); await screenshot('home-mobile'); return; }
    assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[role=tab]')).map(e=>e.getAttribute('aria-label'))"), ['Inicio', 'Mapa', 'Marketplace', 'Biblioteca']);
    await screenshot('home-mobile');
    await click('Marketplace', 'tab'); await visibleText('Calculadora científica');
    await click('Ver Calculadora científica'); await visibleText('Solicitar recurso');
    await click('Solicitar recurso'); await visibleText('Confirmar solicitud'); await click('Confirmar'); await visibleText('Solicitud enviada (mock)');
    await click('Biblioteca', 'tab'); await visibleText('Apuntes de programación'); await click('Ver Apuntes de programación'); await click('Ver vista previa'); await visibleText('Página de ejemplo');
    await click('Inicio', 'tab'); await visibleText('Hola, Alex'); await click('Ver actividades'); await visibleText('Encuentro de intercambio');
    await click('Ver Encuentro de intercambio'); await click('Inscribirme'); await click('Confirmar'); await visibleText('Ya te inscribiste (mock)');
    await click('Inicio', 'tab'); await click('Crear actividad'); await visibleText('Paso 1 de 5');
    await click('Siguiente'); await visibleText('al menos 3 caracteres'); await fill('Nombre de la actividad', 'Taller de prueba'); await click('Siguiente');
    await fill('Fecha · AAAA-MM-DD', '2026-10-15'); await fill('Hora · HH:MM', '13:00'); await click('Siguiente');
    await click('Elegir ubicación'); await click('Patio central'); await click('Siguiente'); await visibleText('Paso 4 de 5'); await visibleText('Taller de prueba');
    await waitFor("!document.body.innerText.includes('Te inscribiste · simulación')");
    await screenshot('wizard-review-mobile'); await click('Atrás'); await visibleText('Paso 3 de 5'); await click('Siguiente'); await click('Siguiente'); await click('Publicar (simulado)'); await visibleText('Publicación creada');
    await click('Ver actividades'); await click('Inicio', 'tab'); await click('Explorar acceso y registro'); await visibleText('Iniciar sesión');
    await click('Crear cuenta'); await fill('Nombre', 'Alex Demo'); await fill('Correo', 'alex@example.test'); await fill('Contraseña ficticia', 'demo123'); await click('Crear cuenta'); await visibleText('Revisa tu correo'); await click('Simular verificación'); await visibleText('Iniciar sesión');
    await click('Olvidé mi contraseña'); await fill('Correo', 'alex@example.test'); await click('Enviar enlace simulado'); await visibleText('Revisa tu correo'); await click('Volver a Login');
    await fill('Correo', 'alex@example.test'); await fill('Contraseña ficticia', 'demo123'); await click('Iniciar sesión'); await visibleText('Hola, Alex');
    await click('Biblioteca', 'tab'); await visibleText('Apuntes de programación'); await fill('Buscar', 'zzzz'); await visibleText('No encontramos resultados'); await click('Limpiar búsqueda y filtros'); await click('Filtros · Todas'); await click('Matemáticas'); await visibleText('Guía de cálculo aplicada');
    for (const width of [320, 390, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false, `Horizontal overflow ${width}`);
    }
    await click('Inicio', 'tab'); await visibleText('Hola, Alex'); await screenshot('home-desktop');
    await click('Mapa', 'tab'); await waitFor("location.pathname === '/map'"); await visibleText('Mapa');
    await navigate('/'); await visibleText('Hola, Alex');
    console.log('PASS: four tabs; physical/digital/activity details; preview; requests; enrollment; wizard validation/back/review/publish; all auth flows; search/empty/filter; 320/390/1280 widths; map route.');
  } finally { ws.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
