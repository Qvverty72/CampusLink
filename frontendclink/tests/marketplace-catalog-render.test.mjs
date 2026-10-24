import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCatalog } from './helpers/marketplace-render.mjs';

for (const screen of ['physical', 'digital']) {
  test(`${screen}: portada real con Babel/NativeWind, navegación institucional y un solo acceso para publicar`, () => {
    const { markup } = renderCatalog(screen);
    assert.match(markup, screen === 'physical' ? /Recursos físicos de tu campus/ : /Apuntes y guías de todos los campus/);
    assert.match(markup, screen === 'physical' ? /Mi actividad/ : /Mi biblioteca/);
    assert.match(markup, /aria-label="Publicar un recurso"/);
    assert.equal((markup.match(/aria-label="Publicar un recurso"/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /Actualizar recursos|Buscar recursos<|Mostrar filtros|Actualizar biblioteca/);
    assert.match(markup, /aria-label="Navegación principal"/);
    assert.match(markup, /aria-selected="true"/);
    if (screen === 'digital') { assert.match(markup, /Recomendados para ti/); assert.match(markup, /Ya lo tienes/); }
    else assert.match(markup, /Buen estado/);
  });
  test(`${screen}: carga con skeleton, error con reintento y vacío con siguiente acción`, () => {
    const loading = renderCatalog(screen, { state: 'loading' }).markup;
    assert.match(loading, /aria-label="Cargando recursos"/);
    const error = renderCatalog(screen, { state: 'error' }).markup;
    assert.match(error, /role="alert"/); assert.match(error, /Reintentar/);
    assert.doesNotMatch(error, /Sin coincidencias/);
    const empty = renderCatalog(screen, { state: 'empty' }).markup;
    assert.match(empty, /Sin coincidencias/); assert.match(empty, /Limpiar filtros/);
  });
}

test('physical detail renders gallery fallback, current status, public owner and contextual request CTA', () => {
  const { markup } = renderCatalog('physical', { mode: 'detail' });
  for (const text of ['Sin fotografías disponibles', 'Calculadora científica', 'Disponible', 'Buen estado', 'Camila González', 'Entrega en tu campus', 'el pago se hace entre ustedes', 'Solicitar este recurso']) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /Retirar imagen|Guardar categoría|Editar publicación/);
  const reserved = renderCatalog('physical', { mode: 'detail', variant: 'reserved' }).markup;
  assert.match(reserved, /Reservado/); assert.match(reserved, /no admite nuevas solicitudes/); assert.match(reserved, /aria-disabled="true"/);
  const owner = renderCatalog('physical', { mode: 'detail', variant: 'own' }).markup;
  assert.match(owner, /No puedes solicitar tu propia publicación/);
});

test('digital detail renders protected preview, academic metadata and real DTO owner figures without original download for a reader', () => {
  const { markup } = renderCatalog('digital', { mode: 'detail' });
  for (const text of ['Vista previa protegida', 'Muestra limitada preparada por el servidor', 'Guía de cálculo integral', 'Ingeniería en Informática', 'Se desbloquea al completar el acuerdo', 'Camila González', '12 valoraciones', '16 acuerdos completados en Biblioteca']) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /aria-label="Descargar/);
  const acquired = renderCatalog('digital', { mode: 'detail', variant: 'acquired' }).markup;
  assert.match(acquired, /Abrir en mis materiales/); assert.doesNotMatch(acquired, /Se desbloquea al completar/);
  const fallback = renderCatalog('digital', { mode: 'detail', variant: 'preview-unavailable' }).markup;
  assert.match(fallback, /no dispone de una muestra/); assert.match(fallback, /guia.pdf/);
  assert.doesNotMatch(fallback, /Este recurso no admite nuevas solicitudes/);
});

test('opening a digital detail shows a skeleton and retry inside detail instead of flashing the catalog', () => {
  assert.match(renderCatalog('digital', { mode: 'detail', state: 'loading' }).markup, /Cargando detalle del recurso/);
  const error = renderCatalog('digital', { mode: 'detail', state: 'error' }).markup;
  assert.match(error, /Reintentar detalle/); assert.doesNotMatch(error, /Todos los recursos/);
});

for (const screen of ['physical', 'digital']) {
  test(`${screen}: request form uses the resource summary and predefined radio messages without free text`, () => {
    const { markup } = renderCatalog(screen, { mode: 'request', width: 320 });
    assert.match(markup, /Mensaje para el propietario/); assert.match(markup, /Enviar solicitud/);
    assert.match(markup, /role="radiogroup"/); assert.match(markup, /aria-checked="true"/);
    assert.match(markup, screen === 'physical' ? /Recurso físico · Mercado/ : /Recurso digital · Biblioteca/);
    assert.doesNotMatch(markup, /<input|<textarea|Descargar archivo/);
  });
  test(`${screen}: received inbox shows requester, status and decisions; failures do not show the empty state`, () => {
    const { markup } = renderCatalog(screen, { mode: 'requests' });
    assert.match(markup, /Diego Pérez/); assert.match(markup, /Pendiente/); assert.match(markup, /Rechazar/); assert.match(markup, /Aceptar/);
    if (screen === 'physical') assert.match(markup, /Las demás esperan/);
    else { assert.match(markup, /propio acuerdo/); assert.doesNotMatch(markup, /reservado|Las demás esperan/); }
    const loading = renderCatalog(screen, { mode: 'requests', state: 'loading' }).markup;
    assert.match(loading, /Cargando solicitudes/); assert.doesNotMatch(loading, /Aún no hay solicitudes/);
    const error = renderCatalog(screen, { mode: 'requests', state: 'error' }).markup;
    assert.match(error, /role="alert"/); assert.match(error, /Reintentar consulta/); assert.doesNotMatch(error, /Aún no hay solicitudes/);
    const empty = renderCatalog(screen, { mode: 'requests', state: 'empty' }).markup;
    assert.match(empty, /Aún no hay solicitudes recibidas/); assert.match(empty, /Actualizar solicitudes/);
  });
}
