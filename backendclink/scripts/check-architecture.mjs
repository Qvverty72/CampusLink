import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule } from 'node:vm';

const root = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const portable = path => relative(root, path).replaceAll('\\', '/');
const moduleOf = path => portable(path).match(/^modules\/(marketplace\/(?:physicalgoods|elibrary)|[^/]+)/)?.[1];
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}

// El parser de Node analiza JS después de retirar tipos. No ejecuta ni enlaza módulos,
// no carga .env y no abre conexiones. Los imports de tipo no son ciclos runtime.
const sources = (await files(root)).filter(path => path.endsWith('.ts'));
const known = new Set(sources), graph = new Map(), violations = [];
for (const file of sources) {
  const source = await readFile(file, 'utf8');
  const javascript = stripTypeScriptTypes(source, { mode: 'transform' });
  const parsed = new SourceTextModule(javascript, { identifier: portable(file) });
  const dynamic = [...javascript.matchAll(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => match[2]);
  const specifiers = [...new Set([...parsed.dependencySpecifiers, ...dynamic])];
  const edges = [];
  for (const specifier of specifiers) {
    if (portable(file).includes('/domain/') && /^(express|pg|mongodb|redis|@supabase\/)/.test(specifier)) {
      violations.push(`${portable(file)}: dominio depende de ${specifier}`);
    }
    if (portable(file).includes('/repositories/') && specifier === 'express') {
      violations.push(`${portable(file)}: repositorio depende de Express`);
    }
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
    if (!known.has(target)) {
      violations.push(`${portable(file)}: import sin destino ${specifier}`);
      continue;
    }
    edges.push(target);
    if (portable(file).includes('/domain/') && /\/(services|repositories|controllers|middleware)\//.test(portable(target))) {
      violations.push(`${portable(file)}: dominio depende de ${portable(target)}`);
    }
    const origin = moduleOf(file), owner = moduleOf(target);
    const publicContract = portable(target).endsWith('/public.ts')
      || /\/(domain|types)\//.test(portable(target))
      || portable(target) === 'modules/auth/middleware/auth.middleware.ts';
    if (origin && owner && origin !== owner && !publicContract) {
      violations.push(`${portable(file)}: accede a implementación privada ${portable(target)}`);
    }
    if (portable(file).includes('/repositories/') && portable(target).startsWith('shared/http/')) {
      violations.push(`${portable(file)}: persistencia depende de transporte HTTP`);
    }
  }
  // Estos métodos de drivers no pertenecen a las capas HTTP o de aplicación.
  if (/\/(controllers|services)\//.test(portable(file)) && /\.\s*(query|collection)\s*(?:<[^;{}]*?>)?\s*\(/.test(javascript)) {
    violations.push(`${portable(file)}: consulta de persistencia fuera de repositorio`);
  }
  graph.set(file, edges);
}

const active = new Set(), finished = new Set(), stack = [];
function visit(file) {
  if (active.has(file)) {
    violations.push('Ciclo runtime: ' + [...stack.slice(stack.indexOf(file)), file].map(portable).join(' -> '));
    return;
  }
  if (finished.has(file)) return;
  active.add(file); stack.push(file);
  for (const target of graph.get(file) ?? []) visit(target);
  stack.pop(); active.delete(file); finished.add(file);
}
for (const file of sources) visit(file);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${sources.length} archivos: imports resueltos, sin ciclos runtime ni infracciones de capas o límites públicos.`);
}
