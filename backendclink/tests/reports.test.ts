import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseContentReport } from '../src/modules/reports/reports.validation.js';
import { isContentReportReceipt, isReportTarget } from '../../frontendclink/src/features/reports/types/report.js';
import type { ReportTarget } from '../../frontendclink/src/features/reports/types/report.js';

const campus = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const oid = 'abcdef012345678901234567';

test('common report accepts four typed locators and bounds reason/description without a client identity or snapshot', () => {
  for (const targetType of ['ACTIVIDAD', 'PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'TRANSACCION']) {
    const targetId = targetType === 'ACTIVIDAD' ? oid : id;
    assert.deepEqual(parseContentReport({ targetType, targetId: targetId.toUpperCase(), reason: '  Motivo  ', description: '  ' }), {
      success: true, data: { targetType, targetId, reason: 'Motivo' },
    });
  }
  for (const input of [null, [], {}, { targetType: 'COMPORTAMIENTO', targetId: id, reason: 'Motivo' },
    { targetType: 'VALORACION', targetId: id, reason: 'Motivo' },
    { targetType: ['ACTIVIDAD'], targetId: oid, reason: 'Motivo' },
    { targetType: 'ACTIVIDAD', targetId: id, reason: 'Motivo' },
    { targetType: 'TRANSACCION', targetId: oid, reason: 'Motivo' },
    { targetType: 'TRANSACCION', targetId: id, reason: '' },
    { targetType: 'TRANSACCION', targetId: id, reason: 'x'.repeat(201) },
    { targetType: 'TRANSACCION', targetId: id, reason: 'Motivo', description: 'x'.repeat(2001) },
    ...['campusId', 'userId', 'accountCampusId', 'snapshot', 'status', 'reportedAt', 'resolution'].map(field => ({
      targetType: 'TRANSACCION', targetId: id, reason: 'Motivo', [field]: 'override',
    }))]) assert.equal(parseContentReport(input).success, false);
});

test('frontend confirms the exact typed target, campus and pending receipt; stale or malformed responses never show success', () => {
  for (const targetType of ['ACTIVIDAD', 'PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'TRANSACCION'] as const) {
    const target: ReportTarget = { targetType, targetId: targetType === 'ACTIVIDAD' ? oid : id, campusId: campus };
    assert.equal(isReportTarget(target), true);
    const receipt = { ...target, id, status: 'PENDIENTE', reportedAt: '2026-10-13T12:00:00Z' };
    assert.equal(isContentReportReceipt(receipt, target), true);
    for (const patch of [{ id: 'x'.repeat(36) }, { targetId: campus }, { targetType: 'COMPORTAMIENTO' },
      { campusId: id }, { status: 'RESUELTO' }, { reportedAt: 'invalid' }, { reportedAt: 123 }]) {
      assert.equal(isContentReportReceipt({ ...receipt, ...patch }, target), false);
    }
  }
  assert.equal(isContentReportReceipt(null, { targetType: 'ACTIVIDAD', targetId: oid, campusId: campus }), false);
  assert.equal(isReportTarget({ targetType: 'TRANSACCION', targetId: oid, campusId: campus }), false);
});
