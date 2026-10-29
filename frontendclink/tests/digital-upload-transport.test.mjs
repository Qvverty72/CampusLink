import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Blob, TextEncoder, ...globals,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}
// Exercise the installed SDK's serializer, including its rejection of legacy {uri} parts.
const { convertFormDataAsync } = load('../node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
});
const { installFormDataPatch } = load('../node_modules/expo/src/winter/FormData.ts');
const ExpoFormData = installFormDataPatch(class { _parts = []; });
const content = new TextEncoder().encode('%PDF-1.7\nOriginal académico\n%%EOF');
class LocalFile {
  constructor(uri) { this.uri = uri; }
  name = 'cache-random-uuid.pdf'; type = ''; size = content.length;
  bytes = async () => content;
}
function api(FormDataClass) {
  const calls = [];
  const request = async (path, init) => {
    const serialized = await convertFormDataAsync(init.body, 'test-boundary');
    calls.push({ path, init, serialized }); return { id: 'saved' };
  };
  return { calls, ...load('../src/features/marketplace/elibrary/api/elibraryApi.ts', {
    'expo-file-system': { File: LocalFile },
    '@/lib/api/authenticated-request': { authenticatedRequest: request },
  }, { FormData: FormDataClass }) };
}
test('initial and additional native PDFs serialize using the installed Expo SDK and preserve metadata, filename and bytes', async () => {
  const state = api(ExpoFormData), file = { name: 'apuntes.pdf', uri: 'file:///cache/apuntes.pdf', sizeBytes: content.length };
  await state.publishDigitalPublication({ title: 'Apuntes', modality: 'DONACION' }, file);
  await state.attachDigitalFile('publication', file);
  assert.equal(state.calls.length, 2);
  for (const { serialized, init } of state.calls) {
    const text = new TextDecoder().decode(serialized.body);
    assert.match(text, /filename="apuntes.pdf"/); assert.match(text, /content-type: application\/pdf/);
    assert.ok(Buffer.from(serialized.body).includes(content)); assert.equal(init.headers, undefined);
  }
  assert.match(new TextDecoder().decode(state.calls[0].serialized.body), /name="metadata"/);
  assert.doesNotMatch(new TextDecoder().decode(state.calls[1].serialized.body), /name="metadata"/);
});
test('web upload preserves the selected PDF and works with standard browser FormData', async () => {
  const state = api(FormData), webFile = new File([content], 'web.pdf', { type: 'application/pdf' });
  await state.publishDigitalPublication({}, { name: webFile.name, uri: 'blob:web', sizeBytes: webFile.size, webFile });
  assert.ok(Buffer.from(state.calls[0].serialized.body).includes(content));
  assert.equal(state.calls[0].init.body.get('file').name, 'web.pdf');
});
