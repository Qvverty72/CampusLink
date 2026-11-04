// Exportar Expo con EXPO_PUBLIC_SUPABASE_URL=https://flow-qa.supabase.co,
// EXPO_PUBLIC_API_URL=https://api.flow-qa.invalid y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ficticia.
// node tests/auth-flow-continuity.qa.mjs (requiere Playwright/Edge de QA).
// CAMPUSLINK_PLAYWRIGHT_MODULE permite usar el runtime existente sin instalar dependencias.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium } = await import(process.env.CAMPUSLINK_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.CAMPUSLINK_AUTH_QA_EXPORT || 'dist/auth-flow-continuity');
const server = http.createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + sep)) return res.writeHead(403).end();
  let bytes;
  try { bytes = await readFile(path); } catch { path = resolve(root, 'index.html'); bytes = await readFile(path); }
  res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(path)] || 'application/octet-stream');
  res.end(bytes);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.CAMPUSLINK_QA_BROWSER || 'msedge', headless: true });
const actor = '11111111-1111-4111-8111-111111111111';
const campus = '22222222-2222-4222-8222-222222222222';
const otherCampus = '33333333-3333-4333-8333-333333333333';
const peer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const storageKey = 'sb-flow-qa-auth-token';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYpQAAAAASUVORK5CYII=', 'base64');
const pdf = Buffer.from('%PDF-1.4\nContenido de prueba local\n%%EOF');
const session = (id = actor, revision = 0) => ({
  access_token: Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') + '.'
    + Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, revision })).toString('base64url') + '.qa',
  refresh_token: `qa-${revision}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id, email: 'qa@example.test', email_confirmed_at: new Date().toISOString(), user_metadata: {} },
});
async function until(check) {
  for (let attempt = 0; attempt < 500; attempt++) { if (check()) return; await delay(20); }
  throw new Error('La condición de QA no se completó.');
}
async function broadcast(page, event, nextSession) {
  await page.evaluate(({ storageKey, event, nextSession }) => {
    if (nextSession) localStorage.setItem(storageKey, JSON.stringify(nextSession)); else localStorage.removeItem(storageKey);
    const channel = new BroadcastChannel(storageKey);
    channel.postMessage({ event, session: nextSession }); channel.close();
  }, { storageKey, event, nextSession });
}
async function resume(page) {
  await page.evaluate(() => {
    for (const visibility of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    }
  });
}

try {
  for (const width of [390, 1280]) {
    for (const domain of ['digital', 'physical']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      let current = session(), currentCampus = campus, meStatus = 200, meStarted = 0, meFinished = 0, gate = null;
      let creates = 0, reports = 0, releaseReport;
      const publication = { id: otherCampus, title: 'Recurso QA', description: 'Contenido QA', ownerId: peer, campusId: campus,
        campusName: 'Campus QA', institutionId: campus, modality: 'DONACION', price: null, currency: 'CLP', status: 'DISPONIBLE',
        files: [{ id: campus, name: 'archivo.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length }], careers: [], subjects: [],
        careerIds: [], subjectIds: [], updatedAt: new Date().toISOString(), acquired: false, isWithdrawn: false, deletedAt: null, acquisition: null };
      const errors = [], headers = [];
      await context.addInitScript(({ storageKey, current }) => localStorage.setItem(storageKey, JSON.stringify(current)), { storageKey, current });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (url.origin === origin || url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
        const reply = (status, json) => route.fulfill({ status, json, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (request.method() === 'OPTIONS') return reply(200, {});
        headers.push({ path, bearer: request.headers().authorization });
        if (path === '/auth/v1/user') return reply(200, current.user);
        if (path === '/api/v1/auth/me') {
          meStarted++;
          // Captura una respuesta anterior para comprobar que el aborto descarta datos tardíos.
          const id = current.user.id, atCampus = currentCampus, status = meStatus;
          if (gate) await gate;
          await reply(status, status === 200 ? { data: {
            userId: id, campusId: atCampus,
            profile: { id, campus_id: atCampus, institucion_id: campus, nombre_completo: 'QA Continuidad', foto_path: null,
              verificado_en: new Date().toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null },
            roles: [], permissions: [], capabilities: { general: true, officialActivities: false, analytics: false, reports: false },
          } } : { error: { message: 'Respuesta controlada de QA' } });
          meFinished++; return;
        }
        if (path.endsWith('/users/me/profile')) return reply(200, { data: { fullName: 'QA Continuidad', campusId: currentCampus, campusName: 'Campus QA', careers: [], updatedAt: new Date().toISOString() } });
        if (path.endsWith('/profile-options')) return reply(200, { data: { campuses: [{ id: currentCampus, name: 'Campus QA' }], careers: [] } });
        if (path.endsWith('/academic-options')) return reply(200, { data: { careers: [], subjects: [] } });
        if (path.endsWith('/recommendations')) return reply(200, { data: [], meta: { page: 1, limit: 6, hasMore: false } });
        if (path.endsWith('/physicalgoods/options')) return reply(200, { data: { campus: { id: currentCampus, name: 'Campus QA' }, categories: [{ id: campus, name: 'Libros' }], careers: [], subjects: [] } });
        if (path === `/api/v1/marketplace/elibrary/${otherCampus}`) return reply(200, { data: publication });
        if (path === `/api/v1/reports/elibrary/${otherCampus}`) {
          reports++; assert.equal(request.postDataJSON().reason, 'Motivo conservado');
          await new Promise(done => { releaseReport = done; });
          return reply(201, { data: { id: actor, campusId: campus, publicationId: otherCampus, transactionId: null, status: 'PENDIENTE', reportedAt: new Date().toISOString() } });
        }
        if (path === '/api/v1/marketplace/elibrary' || path === '/api/v1/marketplace/physicalgoods') {
          if (request.method() === 'POST') {
            creates++; assert.equal(request.headers().authorization, `Bearer ${current.access_token}`);
            if (domain === 'digital') {
              const form = await new Response(request.postDataBuffer(), { headers: { 'Content-Type': request.headers()['content-type'] } }).formData();
              assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), pdf);
              const metadata = JSON.parse(form.get('metadata'));
              assert.equal(metadata.title, 'Borrador conservado'); assert.equal(metadata.modality, 'VENTA'); assert.equal(metadata.price, 1500);
            } else {
              const input = request.postDataJSON(); assert.equal(input.title, 'Borrador conservado');
              assert.equal(input.modality, 'VENTA'); assert.equal(input.price, 1500);
              assert.equal(input.photo.base64, png.toString('base64'));
            }
            return reply(503, { error: { message: 'Fallo simulado de publicación' } });
          }
          return reply(200, { data: domain === 'digital' ? [publication] : [], meta: { page: 1, limit: 20, hasMore: false } });
        }
        errors.push(`Solicitud inesperada ${path}`); return reply(404, {});
      });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
      const title = () => page.getByLabel(domain === 'digital' ? 'Título' : 'Nombre del recurso', { exact: true }).filter({ visible: true });
      const selected = () => domain === 'digital' ? button('Quitar borrador.pdf') : page.getByLabel('Vista previa de imagen 1', { exact: true });
      async function preserved() {
        assert.equal(await title().inputValue(), 'Borrador conservado');
        assert.equal(await page.getByLabel(domain === 'digital' ? 'Descripción' : 'Descripción del recurso', { exact: true }).inputValue(), 'Descripción que debe mantenerse.');
        assert.equal(await page.getByLabel(domain === 'digital' ? 'Precio (CLP)' : 'Precio de venta (CLP)', { exact: true }).inputValue(), '1500');
        assert.equal(await selected().count(), 1);
        assert.match(page.url(), domain === 'digital' ? /\/elibrary$/ : /\/physicalgoods$/);
      }
      await page.goto(`${origin}/profile`); await page.getByText('QA Continuidad', { exact: true }).waitFor();
      await page.getByRole('tab', { name: domain === 'digital' ? 'Biblioteca' : 'Mercado', exact: true }).click();
      await button(domain === 'digital' ? 'Publicar recurso' : 'Publicar un recurso').click();
      await title().fill('Borrador conservado');
      await page.getByLabel(domain === 'digital' ? 'Descripción' : 'Descripción del recurso', { exact: true }).fill('Descripción que debe mantenerse.');
      if (domain === 'physical') await page.getByRole('radio', { name: 'Libros', exact: true }).click();
      await page.getByRole('radio', { name: 'Venta', exact: true }).click();
      await page.getByLabel(domain === 'digital' ? 'Precio (CLP)' : 'Precio de venta (CLP)', { exact: true }).fill('1500');
      const chooser = page.waitForEvent('filechooser');
      await button(domain === 'digital' ? 'Seleccionar archivos PDF' : 'Agregar imágenes').click();
      await (await chooser).setFiles({ name: domain === 'digital' ? 'borrador.pdf' : 'borrador.png', mimeType: domain === 'digital' ? 'application/pdf' : 'image/png', buffer: domain === 'digital' ? pdf : png });
      await selected().waitFor();

      // Comprobar el formulario también mientras /me está pendiente, no solo al terminar.
      for (const event of ['resume', 'SIGNED_IN', 'TOKEN_REFRESHED']) {
        let release; gate = new Promise(done => { release = done; }); const started = meStarted, finished = meFinished;
        if (event === 'resume') await resume(page);
        else { if (event === 'TOKEN_REFRESHED') current = session(actor, 1); await broadcast(page, event, current); }
        await until(() => meStarted > started); await preserved();
        gate = null; release(); await until(() => meFinished > finished); await preserved();
      }

      // Una indisponibilidad temporal conserva el flujo; la siguiente activación reintenta.
      meStatus = 503; let finished = meFinished; await resume(page); await until(() => meFinished > finished); await preserved();
      meStatus = 200; finished = meFinished; await resume(page); await until(() => meFinished > finished); await preserved();
      await button('Publicar recurso').click(); await until(() => creates === 1); await preserved();
      assert.ok(headers.some(entry => entry.path.endsWith('/auth/me') && entry.bearer === `Bearer ${current.access_token}`));

      // Cambiar campus debe descartar el borrador anterior aunque se conserve la sesión.
      currentCampus = otherCampus; finished = meFinished; await resume(page); await until(() => meFinished > finished);
      await button(domain === 'digital' ? 'Publicar recurso' : 'Publicar un recurso').waitFor();
      await button(domain === 'digital' ? 'Publicar recurso' : 'Publicar un recurso').click();
      assert.equal(await title().inputValue(), ''); assert.equal(await selected().count(), 0);
      await title().fill('No transferir a otra cuenta');
      let release; gate = new Promise(done => { release = done; }); const started = meStarted;
      await resume(page); await until(() => meStarted > started);
      // Logout durante una consulta pendiente: su resultado no puede restaurar la sesión.
      await broadcast(page, 'SIGNED_OUT', null);
      await page.getByLabel('Correo', { exact: true }).filter({ visible: true }).waitFor();
      gate = null; release(); await delay(150); assert.equal(await title().count(), 0);
      current = session(peer, 2); await broadcast(page, 'SIGNED_IN', current);
      await page.getByText('QA Continuidad', { exact: true }).filter({ visible: true }).waitFor();
      await page.getByRole('tab', { name: domain === 'digital' ? 'Biblioteca' : 'Mercado', exact: true }).click();
      await button(domain === 'digital' ? 'Publicar recurso' : 'Publicar un recurso').click(); assert.equal(await title().inputValue(), '');

      if (domain === 'digital') {
        await button('Volver a la biblioteca').click(); await button('Consultar Recurso QA').click();
        await button('Denunciar publicación digital').click(); await page.getByLabel('Motivo de la denuncia').fill('Motivo conservado');
        current = session(peer, 3); finished = meFinished; await broadcast(page, 'TOKEN_REFRESHED', current);
        await until(() => meFinished > finished); assert.equal(await page.getByLabel('Motivo de la denuncia').inputValue(), 'Motivo conservado');
        await button('Enviar denuncia').click(); await until(() => reports === 1 && releaseReport);
        current = session(peer, 4); finished = meFinished; await broadcast(page, 'TOKEN_REFRESHED', current);
        await until(() => meFinished > finished); releaseReport();
        await page.getByText('Denuncia enviada. Quedó pendiente de revisión.', { exact: true }).waitFor();
        assert.equal(reports, 1);
      }

      // Denegación definitiva retira las rutas protegidas.
      meStatus = 403; await resume(page);
      await page.getByText('Tu cuenta no tiene acceso o falta completar tu registro.', { exact: true }).filter({ visible: true }).waitFor();
      assert.equal(await title().count(), 0);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, domain, creates, reports, checks: ['resume pendiente', 'SIGNED_IN repetido', 'token rotado', '503 y recuperación', 'archivo y bearer vigentes', 'campus', 'logout y respuesta tardía', 'otra cuenta', '403', ...(domain === 'digital' ? ['borrador y envío de denuncia durante renovación'] : [])] }));
      await context.close();
    }
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
