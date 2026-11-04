import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const checker = resolve('scripts/check-architecture.mjs');
const inspect = (root: string) => spawnSync(process.execPath, ['--experimental-vm-modules', checker, root], { encoding: 'utf8' });
async function fixture(files: Record<string, string>, run: (root: string) => void) {
  const root = await mkdtemp(join(tmpdir(), 'campuslink-architecture-'));
  try {
    for (const [path, source] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), source);
    }
    run(root);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('campuslink-architecture-'));
    await rm(root, { recursive: true, force: true });
  }
}

test('backend runtime dependencies resolve and respect module and layer boundaries', () => {
  const result = inspect(resolve('src'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sin ciclos runtime/);
});

test('architecture check rejects a cycle that closes through a literal dynamic import', async () => {
  await fixture({
    'modules/sample/services/a.ts': "export const load = () => import('./b.js');",
    'modules/sample/services/b.ts': "export { load } from './a.js';",
  }, root => {
    const result = inspect(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ciclo runtime/);
  });
});

test('architecture check rejects private cross-module access and persistence in HTTP', async () => {
  await fixture({
    'modules/a/repositories/data.ts': 'export const read = () => 1;',
    'modules/b/controllers/b.ts': "import { read } from '../../a/repositories/data.js'; export const handler = client => client.query('SELECT 1') + read();",
    'modules/b/services/b.ts': 'export const value = 1;',
    'modules/b/domain/rule.ts': "export { value } from '../services/b.js';",
  }, root => {
    const result = inspect(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /implementación privada/);
    assert.match(result.stderr, /persistencia fuera de repositorio/);
    assert.match(result.stderr, /dominio depende/);
  });
});
