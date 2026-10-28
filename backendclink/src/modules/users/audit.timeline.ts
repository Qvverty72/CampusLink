import type { AuditEntry } from './access.types.js';
import type { PaginationParams } from '../../types/api.js';
import { createPaginatedResult } from '../../services/pagination.js';

const timestamp = (value: string) => value.replace(/\.(\d+)Z$/, (_, fraction: string) => '.' + fraction.padEnd(6, '0') + 'Z');
/** Orden total compartido: preserva los microsegundos SQL y los milisegundos Mongo. */
export function compareAuditEntries(a: AuditEntry, b: AuditEntry) {
  const left = timestamp(a.created_at), right = timestamp(b.created_at);
  return left === right ? (a.id === b.id ? 0 : a.id > b.id ? -1 : 1) : left > right ? -1 : 1;
}

type ReadPage = (limit: number, offset: number) => Promise<AuditEntry[]>;
/** Mezcla fuentes ordenadas en lotes acotados; no carga toda la historia de páginas anteriores. */
export async function auditTimeline(pagination: PaginationParams, readSql: ReadPage, readMongo: ReadPage) {
  const batch = 100;
  const cursor = (read: ReadPage) => {
    let buffer: AuditEntry[] = [], offset = 0, end = false;
    return async () => {
      if (!buffer.length && !end) {
        buffer = await read(batch, offset); offset += buffer.length; end = buffer.length < batch;
      }
      return buffer.shift();
    };
  };
  const sql = cursor(readSql), mongo = cursor(readMongo);
  let [left, right] = await Promise.all([sql(), mongo()]);
  const rows: AuditEntry[] = [];
  let skipped = 0;
  while (left || right) {
    const takeSql = !!left && (!right || compareAuditEntries(left, right) <= 0);
    const row = takeSql ? left! : right!;
    if (skipped++ >= pagination.offset) rows.push(row);
    if (rows.length > pagination.limit) break;
    if (takeSql) left = await sql(); else right = await mongo();
  }
  return createPaginatedResult(rows, pagination);
}
