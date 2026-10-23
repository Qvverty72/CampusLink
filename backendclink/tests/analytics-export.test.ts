import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { renderReportExcel, renderReportPdf } from '../src/modules/analytics/analytics.export.js';
import type { AnalyticalReport, DashboardMetrics } from '../src/modules/analytics/analytics.types.js';

function fixture(): AnalyticalReport {
  const scope = { institutionId: 'institution-id', institutionName: 'Institución histórica ÁÉÍÓÚ ñ Ω', campusId: null,
    campusName: 'Principal, Otra', campuses: [{ id: 'campus-1', name: 'Principal' }, { id: 'campus-2', name: 'Otra' }],
    career: { id: 'career-id', name: '=HYPERLINK("https://example.invalid")' } };
  const period = { from: '2026-10-01', to: '2026-10-31', timeZone: 'America/Santiago', cutoff: '2026-10-22T16:35:42.123Z' };
  const metric = (value: number | null) => ({ value, scope, period });
  const metrics: DashboardMetrics = { scope, period, activeUsers: metric(42),
    resourceDemand: { ...metric(700), views: 17, requests: 23 },
    subjectDemand: { ...metric(800), views: 37, requests: 41, subjects: [
      { subjectId: 'subject-id', subjectName: '+Álgebra & Análisis <avanzado> Ω', views: 37, requests: 41 },
    ] }, activityParticipation: { ...metric(55), legacyEvents: 4, label: 'Inscripciones registradas' } };
  const zero = { ...metrics, resourceDemand: { ...metric(0), views: 0, requests: 0 },
    subjectDemand: { ...metric(0), views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric(0), legacyEvents: 0, label: 'Inscripciones registradas' } };
  return { ...metrics, id: '00000000-0000-4000-8000-000000000001', generatedBy: { userId: 'user-id', name: 'Responsable original' },
    generatedAt: '2026-10-22T16:35:42.123Z', grouping: 'week', calculationVersion: 'campuslink-kpi-v1',
    intervals: [
      { key: 'first', label: 'Semana original', period, status: 'recorded', coverage: 'partial', metrics },
      { key: 'zero', label: 'Semana sin actividad', period, status: 'no_activity', coverage: 'partial', metrics: zero },
      { key: 'future', label: 'Semana futura', period: { ...period, from: '2026-10-26' }, status: 'unavailable', coverage: 'unavailable', metrics: null },
    ], notes: ['Nota histórica de cobertura parcial.', 'Carreras no exclusivas.'] };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze);
  }
  return value;
}

test('XLSX preserves raw numbers, original filters/definitions, zero vs missing, and literal spreadsheet text', async () => {
  const report = freeze(fixture()), original = JSON.stringify(report);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await renderReportExcel(report));
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Reporte', 'Indicadores', 'Periodos', 'Asignaturas', 'Definiciones', 'Notas']);
  const summary = workbook.getWorksheet('Indicadores')!, periods = workbook.getWorksheet('Periodos')!;
  assert.equal(summary.getCell('I2').value, 42); assert.equal(summary.getCell('J2').value, 700);
  assert.equal(summary.getCell('K2').value, 17); assert.equal(summary.getCell('L2').value, 23);
  assert.equal(summary.getCell('M2').value, 800); assert.equal(summary.getCell('P2').value, 55); assert.equal(summary.getCell('Q2').value, 4);
  assert.equal(periods.getCell('G3').value, 'no_activity'); assert.equal(periods.getCell('I3').value, 42);
  assert.equal(periods.getCell('J3').value, 0); assert.equal(periods.getCell('P3').value, 0);
  assert.equal(periods.getCell('G4').value, 'unavailable'); assert.equal(periods.getCell('H4').value, 'unavailable');
  for (let column = 9; column <= 17; column++) assert.equal(periods.getRow(4).getCell(column).value, null);
  const subjects = workbook.getWorksheet('Asignaturas')!;
  assert.equal(subjects.rowCount, 3); assert.equal(subjects.getCell('I2').value, report.subjectDemand.subjects[0].subjectName);
  assert.equal(subjects.getCell('J2').value, 37); assert.equal(subjects.getCell('K2').value, 41);
  const metadata = workbook.getWorksheet('Reporte')!;
  let found = false;
  metadata.eachRow(row => { if (row.getCell(1).value === 'Carrera') { found = true; assert.equal(row.getCell(2).value, report.scope.career!.name); assert.equal(row.getCell(2).type, ExcelJS.ValueType.String); } });
  assert.ok(found);
  for (const sheet of workbook.worksheets) {
    assert.ok(sheet.autoFilter); assert.equal(sheet.views[0].state, 'frozen');
    sheet.eachRow(row => row.eachCell(cell => assert.notEqual(cell.type, ExcelJS.ValueType.Formula)));
  }
  assert.equal(workbook.getWorksheet('Notas')!.getCell('A2').value, report.notes[0]);
  assert.equal(workbook.getWorksheet('Definiciones')!.getCell('C2').value, report.calculationVersion);
  assert.equal(JSON.stringify(report), original);
});

test('future-only summary exports missing numeric cells rather than zero observations', async () => {
  const report = fixture();
  for (const key of ['activeUsers', 'resourceDemand', 'subjectDemand', 'activityParticipation'] as const) report[key].value = null;
  report.resourceDemand.views = report.resourceDemand.requests = report.subjectDemand.views = report.subjectDemand.requests = 0;
  report.activityParticipation.legacyEvents = 0; report.subjectDemand.subjects = []; report.intervals = [report.intervals[2]];
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await renderReportExcel(report));
  const sheet = workbook.getWorksheet('Indicadores')!;
  assert.equal(sheet.getCell('G2').value, 'unavailable');
  for (let column = 9; column <= 17; column++) assert.equal(sheet.getRow(2).getCell(column).value, null);
});

test('PDF text retains original metrics, accents, notes and definitions and paginates long names within margins', async () => {
  const report = fixture();
  report.scope.institutionName += ' ' + 'NombreInstitucionalSinEspacios'.repeat(12);
  report.subjectDemand.subjects.push(...Array.from({ length: 65 }, (_, index) => ({
    subjectId: `long-subject-${index}`, subjectName: `Asignatura ${index} ` + 'Álgebra'.repeat(16), views: index, requests: index + 1,
  })));
  const original = JSON.stringify(report); freeze(report);
  const bytes = await renderReportPdf(report);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  try {
    const document = await task.promise;
    assert.ok(document.numPages >= 5);
    let text = '';
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index), content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        text += item.str + '\n';
        assert.ok(item.transform[4] >= 43 && item.transform[4] + item.width <= 552, `horizontal margin: ${item.str}`);
        assert.ok(item.transform[5] >= 27 && item.transform[5] <= 813, `vertical margin: ${item.str}`);
      }
    }
    for (const expected of ['Institución histórica ÁÉÍÓÚ ñ Ω', report.id, report.generatedAt, 'Responsable original',
      'Usuarios activos al corte: 42', 'Demanda de recursos: 700', 'Vistas: 17', 'Solicitudes: 23',
      'Demanda de asignaturas: 800', 'Inscripciones registradas: 55', 'Semana sin actividad', 'Semana futura',
      'Sin datos disponibles', 'no representa asistencia presencial', report.notes[0], report.calculationVersion,
      'long-subject-64']) assert.ok(text.includes(expected), expected);
    assert.equal(JSON.stringify(report), original);
  } finally { await task.destroy(); }
});
