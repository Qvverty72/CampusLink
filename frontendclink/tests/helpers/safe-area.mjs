import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../../src/lib/layout/safeArea.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Ejecuta el helper real con la plataforma del harness, sin medir un DOM simulado. */
export function loadSafeArea(platform = 'ios') {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({ Platform: { OS: platform } }) });
  return module.exports;
}
