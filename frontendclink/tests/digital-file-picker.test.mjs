import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/features/marketplace/elibrary/api/documentPicker.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function picker(assets, nativeFiles = {}) {
  const revoked = [], module = { exports: {} };
  const mocks = {
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets }) },
    'expo-file-system': { File: class {
      size = 0;
      constructor(uri) { this.uri = uri; }
      async arrayBuffer() { return Uint8Array.from(nativeFiles[this.uri]).buffer; }
    } },
    '../types/publication': { DIGITAL_MAX_BYTES: 25 * 1024 * 1024 },
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL: { revokeObjectURL: uri => revoked.push(uri) }, require: name => {
    assert.ok(Object.hasOwn(mocks, name)); return mocks[name];
  } });
  return { pick: module.exports.pickDigitalFiles, merge: module.exports.mergeUniqueDigitalFiles, revoked };
}
for (const [name, size, mimeType, expected] of [
  ['grande.pdf', 25 * 1024 * 1024 + 1, 'application/pdf', /grande.pdf:.*supera.*25 MB/],
  ['vacío.pdf', 0, 'application/pdf', /vacío.pdf:.*vacío/],
  ['archivo.docx', 100, 'application/pdf', /archivo.docx:.*Solo se admiten archivos PDF/],
  ['falso.pdf', 100, 'text/plain', /falso.pdf:.*Solo se admiten archivos PDF/],
]) {
  test(`picker explains rejection for ${name} and releases the rejected batch`, async () => {
    const state = picker([{ name, size, mimeType, uri: 'blob:test', file: {} }]);
    await assert.rejects(state.pick(), expected); assert.deepEqual(state.revoked, ['blob:test']);
  });
}
test('picker preserves a valid PDF selection and accepts the exact size boundary', async () => {
  const file = {}, state = picker([{ name: 'válido.pdf', size: 25 * 1024 * 1024, mimeType: 'application/pdf', uri: 'blob:valid', file }]);
  const result = await state.pick(); assert.equal(result[0].webFile, file); assert.equal(result[0].name, 'válido.pdf'); assert.deepEqual(state.revoked, []);
});

const webFile = (name, uri, bytes) => ({ name, uri, sizeBytes: bytes.length, webFile: { arrayBuffer: async () => Uint8Array.from(bytes).buffer } });
test('same content renamed in one batch is retained once and the duplicate URL is released', async () => {
  const first = webFile('uno.pdf', 'blob:one', [1, 2, 3]), duplicate = webFile('otro.pdf', 'blob:two', [1, 2, 3]), state = picker([]);
  const result = await state.merge([], [first, duplicate]);
  assert.equal(result.files.length, 1); assert.strictEqual(result.files[0], first); assert.equal(result.duplicates[0], 'otro.pdf');
  assert.deepEqual(state.revoked, ['blob:two']);
});
test('a repeated selection keeps the existing file and accepts different content with the same name and size', async () => {
  const first = webFile('igual.pdf', 'blob:old', [1, 2]), duplicate = webFile('copia.pdf', 'blob:copy', [1, 2]);
  const different = webFile('igual.pdf', 'blob:new', [2, 1]), state = picker([]), result = await state.merge([first], [duplicate, different]);
  assert.equal(result.files.length, 2); assert.strictEqual(result.files[0], first); assert.strictEqual(result.files[1], different);
  assert.equal(result.duplicates.length, 1); assert.deepEqual(state.revoked, ['blob:copy']);
});
test('native file bytes are compared too, without depending on names or browser crypto', async () => {
  const first = { name: 'uno.pdf', uri: 'file:///one', sizeBytes: 2 }, second = { name: 'dos.pdf', uri: 'file:///two', sizeBytes: 2 };
  const state = picker([], { [first.uri]: [3, 4], [second.uri]: [3, 4] }), result = await state.merge([first], [second]);
  assert.equal(result.files.length, 1); assert.equal(result.duplicates[0], 'dos.pdf'); assert.deepEqual(state.revoked, []);
});
test('read failures release new selections and preserve existing URLs', async () => {
  const first = webFile('old.pdf', 'blob:old', [1]), unreadable = webFile('bad.pdf', 'blob:bad', [1]), state = picker([]);
  unreadable.webFile.arrayBuffer = async () => { throw new Error('local file unavailable'); };
  await assert.rejects(state.merge([first], [unreadable]), /No se pudo leer/); assert.deepEqual(state.revoked, ['blob:bad']);
});
