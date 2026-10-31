import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { DIGITAL_MAX_BYTES, validateDigitalFile } from '../src/modules/marketplace/elibrary/elibrary.validation.js';
import { ApiError } from '../src/shared/errors/api-error.js';

const upload = (bytes: Buffer) => ({ name: 'material.pdf', mimeType: 'application/pdf', bytes });
test('generic, missing and alternate PDF MIME values are normalized only after validating real PDF bytes', async () => {
  const bytes = await document();
  for (const mimeType of ['', 'application/octet-stream', 'application/x-pdf', 'Application/PDF; charset=binary']) {
    const saved = await validateDigitalFile({ ...upload(bytes), mimeType });
    assert.equal(saved.mimeType, 'application/pdf'); assert.strictEqual(saved.bytes, bytes);
    await assert.rejects(validateDigitalFile({ ...upload(Buffer.from('renamed text')), mimeType }), { status: 400 });
  }
});
async function document(edit: (pdf: PDFDocument) => void | Promise<void> = () => {}, compressed = true) {
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('Material de prueba'); await edit(pdf);
  return Buffer.from(await pdf.save({ useObjectStreams: compressed }));
}
function link(pdf: PDFDocument, uri: string, indirect = false, hex = false) {
  const action = pdf.context.obj({ S: 'URI', URI: hex ? PDFHexString.fromText(uri) : PDFString.of(uri) });
  const annotation = pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 20], A: indirect ? pdf.context.register(action) : action });
  pdf.getPage(0).node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(annotation)]));
  return action;
}
async function rejected(bytes: Buffer, message: RegExp, status = 400) {
  await assert.rejects(validateDigitalFile(upload(bytes)), (reason: unknown) => {
    assert.ok(reason instanceof ApiError); assert.equal(reason.status, status); assert.match(reason.message, message);
    if (status === 400) assert.equal(reason.details?.[0].field, 'file');
    return true;
  });
}

for (const uri of ['https://example.test/apuntes', 'HTTPS://example.test/recurso?q=1', 'mailto:alumno@example.test', 'tel:+56912345678', 'tel:+56-2-12345678;ext=12']) {
  test(`accepts approved PDF link ${uri.split(':')[0]} and preserves original bytes`, async () => {
    const bytes = await document(pdf => { link(pdf, uri, true, true); });
    const result = await validateDigitalFile(upload(bytes)); assert.strictEqual(result.bytes, bytes); assert.deepEqual(result.bytes, bytes);
  });
}
for (const uri of ['http://example.test', 'file:///C:/private.txt', 'javascript:alert(1)', 'data:text/html,test', 'ftp://example.test', '//example.test']) {
  test(`rejects link scheme ${uri.split(':')[0]} with an actionable message`, async () => {
    await rejected(await document(pdf => { link(pdf, uri); }), uri.startsWith('http:') ? /HTTP.*HTTPS/ : /enlace no permitido/);
  });
}
for (const uri of ['https:', 'https:///','https:example.test', 'mailto:', 'mailto:no-address', 'tel:', 'tel:abc', 'https://example.test/\nfile', 'mailto:user%0d%0a@example.test']) {
  test(`rejects malformed destination ${JSON.stringify(uri)}`, async () => {
    await rejected(await document(pdf => { link(pdf, uri); }), /enlace inválido/);
  });
}

test('accepts tagged list/layout attributes, glyph A and passive destinations without confusing them with actions', async () => {
  const bytes = await document(pdf => {
    const list = pdf.context.obj({ Type: 'StructElem', S: 'L', A: [{ O: 'List', ListNumbering: 'Circle' }] });
    const span = pdf.context.obj({ Type: 'StructElem', S: 'Span', A: { O: 'Layout', Placement: 'Block' } });
    pdf.catalog.set(PDFName.of('StructTreeRoot'), pdf.context.obj({ Type: 'StructTreeRoot', K: [list, span] }));
    pdf.catalog.set(PDFName.of('GlyphFixture'), pdf.context.obj({ A: pdf.context.stream('glyph') }));
    pdf.getPage(0).node.set(PDFName.of('Annots'), pdf.context.obj([{ Type: 'Annot', Subtype: 'Link', Dest: [pdf.getPage(0).ref, 'Fit'] }]));
  });
  await validateDigitalFile(upload(bytes));
});

for (const compressed of [false, true]) {
  test(`rejects JavaScript in ${compressed ? 'compressed' : 'plain'} objects with a specific message`, async () => {
    await rejected(await document(pdf => { pdf.addJavaScript('test', 'app.alert(1)'); }, compressed), /JavaScript/);
  });
}
test('rejects indirect JavaScript actions and never mistakes their A key for structure', async () => {
  await rejected(await document(pdf => {
    const action = pdf.context.register(pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }));
    pdf.catalog.set(PDFName.of('Fixture'), pdf.context.obj({ Type: 'Annot', Subtype: 'Link', A: action }));
  }), /JavaScript/);
});
test('rejects embedded files, encryption, missing pages and parser failures with distinct messages', async () => {
  await rejected(await document(async pdf => { await pdf.attach(new Uint8Array([1, 2]), 'adjunto.txt'); }), /adjuntos incrustados/);
  await rejected(await document(pdf => { pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: 'Standard' })); }), /cifrado|contraseña/);
  const empty = await PDFDocument.create(); await rejected(Buffer.from(await empty.save({ addDefaultPage: false })), /no tiene páginas/);
  await rejected(Buffer.from('%PDF-1.7\nfake\n%%EOF'), /dañado|estructura/);
  await rejected(Buffer.from('%PDF-1.7\nincompleto'), /PDF completo/);
  await rejected(Buffer.alloc(0), /vacío/);
  await rejected(Buffer.alloc(DIGITAL_MAX_BYTES + 1), /25 MB/, 413);
});
for (const trigger of ['OpenAction', 'AA']) {
  test(`rejects automatic trigger ${trigger} even for an approved HTTPS destination`, async () => {
    await rejected(await document(pdf => {
      const action = pdf.context.obj({ S: 'URI', URI: PDFString.of('https://example.test') });
      pdf.catalog.set(PDFName.of(trigger), trigger === 'AA' ? pdf.context.obj({ O: action }) : action);
    }), /acciones automáticas/);
  });
}
for (const kind of ['Launch', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'Named', 'UnknownAction']) {
  test(`rejects action ${kind}`, async () => {
    await rejected(await document(pdf => {
      pdf.catalog.set(PDFName.of('Fixture'), pdf.context.obj({ Type: 'Annot', Subtype: 'Link', A: { S: kind } }));
    }), /acción no permitida/);
  });
}
test('rejects chained actions after an approved link and malformed action dictionaries', async () => {
  await rejected(await document(pdf => {
    link(pdf, 'https://example.test').set(PDFName.of('Next'), pdf.context.obj({ S: 'URI', URI: PDFString.of('https://other.test') }));
  }), /acciones encadenadas/);
  await rejected(await document(pdf => { pdf.catalog.set(PDFName.of('Fixture'), pdf.context.obj({ Type: 'Annot', Subtype: 'Link', A: [] })); }), /acción inválida/);
});
test('rejects XFA and multimedia with their own explanations', async () => {
  await rejected(await document(pdf => { pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ XFA: PDFString.of('form') })); }), /XFA/);
  await rejected(await document(pdf => { pdf.catalog.set(PDFName.of('Fixture'), pdf.context.obj({ Type: 'Annot', Subtype: 'RichMedia' })); }), /multimedia/);
});
test('format and MIME rejections retain the existing HTTP contract and field details', async () => {
  const bytes = await document();
  await assert.rejects(validateDigitalFile({ ...upload(bytes), name: 'material.docx' }), { status: 400, message: /extensión .pdf/ });
  await assert.rejects(validateDigitalFile({ ...upload(bytes), mimeType: 'text/plain' }), { status: 400, message: /tipo del archivo/ });
  await assert.rejects(validateDigitalFile({ ...upload(bytes), name: '' }), { status: 400, message: /nombre válido/ });
  await assert.rejects(validateDigitalFile({ ...upload(bytes), name: 'x'.repeat(256) + '.pdf' }), { status: 400, message: /255 caracteres/ });
  await assert.rejects(validateDigitalFile({ ...upload(bytes), name: '../material.pdf' }), { status: 400, message: /ruta o caracteres/ });
});
