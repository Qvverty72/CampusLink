import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { renderReportExcel, renderReportPdf } from '../src/modules/analytics/exports/analytics.export.js';
import type { AnalyticalReport, DashboardMetrics } from '../src/modules/analytics/types/analytics.types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPORT_KPIS, reportFilename } from '../src/modules/analytics/domain/analytics.presentation.js';

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
  return { ...metrics, id: '00000000-0000-4000-8000-000000000001', generatedBy: { userId: 'user-id', name: 'Responsable original', email: 'original.reporter@duocuc.cl' },
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
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Leeme', 'Reporte', 'Indicadores', 'Periodos', 'Asignaturas', 'Definiciones', 'Notas']);
  const summary = workbook.getWorksheet('Indicadores')!, periods = workbook.getWorksheet('Periodos')!;
  assert.equal(summary.getCell('I2').value, 42); assert.equal(summary.getCell('J2').value, 700);
  assert.equal(summary.getCell('K2').value, 17); assert.equal(summary.getCell('L2').value, 23);
  assert.equal(summary.getCell('M2').value, 800); assert.equal(summary.getCell('P2').value, 55);
  assert.equal(summary.columnCount, 16); assert.equal(summary.getCell('P1').value, 'Inscripciones');
  for (const sheet of workbook.worksheets) sheet.eachRow(row => row.eachCell(cell => assert.ok(!String(cell.value ?? '').toLowerCase().includes('eventos importados'))));
  assert.equal(periods.getCell('G3').value, 'no_activity'); assert.equal(periods.getCell('I3').value, 42);
  assert.equal(periods.getCell('J3').value, 0); assert.equal(periods.getCell('P3').value, 0);
  assert.equal(periods.getCell('G4').value, 'unavailable'); assert.equal(periods.getCell('H4').value, 'unavailable');
  for (let column = 9; column <= 16; column++) assert.equal(periods.getRow(4).getCell(column).value, null);
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
  const guide = new Map(); workbook.getWorksheet('Leeme')!.eachRow(row => guide.set(row.getCell(1).value, row.getCell(2).value));
  assert.ok(String(guide.get('Indicadores')).includes('No sumar')); assert.equal(guide.get('Correo del responsable'), report.generatedBy.email);
  const meta = new Map(); metadata.eachRow(row => meta.set(row.getCell(1).value, row.getCell(2).value));
  assert.equal(meta.get('Correo del responsable'), report.generatedBy.email);
  assert.equal(summary.getCell('I2').numFmt, '#,##0'); assert.equal(periods.columnCount, 16); assert.equal(subjects.columnCount, 11);
  assert.deepEqual(periods.getRow(1).values, summary.getRow(1).values, 'summary and periods keep the same16 headers and order');
  assert.equal(periods.getCell('I1').value, 'Usuarios activos'); assert.equal(subjects.getCell('A1').value, 'Intervalo ID');
  assert.ok(subjects.getCell('A1').note); assert.notDeepEqual(summary.getCell('I1').fill, summary.getCell('J1').fill);
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
  for (let column = 9; column <= 16; column++) assert.equal(sheet.getRow(2).getCell(column).value, null);
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
    let text = ''; const pageTexts: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index), content = await page.getTextContent();
      let current = '';
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        text += item.str + '\n';
        current += item.str + '\n';
        assert.ok(item.transform[4] >= 43 && item.transform[4] + item.width <= 552, `horizontal margin: ${item.str}`);
        assert.ok(item.transform[5] >= 27 && item.transform[5] <= 813, `vertical margin: ${item.str}`);
      }
      pageTexts.push(current);
    }
    for (const expected of ['Institución histórica ÁÉÍÓÚ ñ Ω', report.id, report.generatedAt, 'Responsable original',
      'Cuentas activas', '700', '17 vistas', '23 solicitudes',
      '800', '55', 'Semana sin actividad', 'Semana futura',
      'Sin datos disponibles', 'no es asistencia presencial', report.notes[0], report.calculationVersion,
      'long-subject-64', 'original.reporter@duocuc.cl']) assert.ok(text.includes(expected), expected);
    assert.ok(!text.toLowerCase().includes('eventos importados'), 'no imported-event counter for positive or zero values');
    assert.equal(JSON.stringify(report), original);
    for (const value of Object.values(REPORT_KPIS)) assert.ok(pageTexts[0].includes(value.title), 'all4 KPI belong on the first page');
    assert.ok(pageTexts[0].includes('42')); assert.ok(pageTexts[0].includes('700')); assert.ok(!pageTexts[0].includes('Reporte ID:'));
    const appendix = text.slice(text.indexOf('Anexo técnico'));
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await renderReportExcel(report)); let last = -1;
    book.getWorksheet('Reporte')!.eachRow((row, index) => {
      if (index === 1) return;
      const key = String(row.getCell(1).value), value = String(row.getCell(2).value ?? '');
      const at = appendix.indexOf(key + ':'); assert.ok(at > last, key); last = at;
      assert.ok(appendix.replace(/\s/g, '').includes(value.replace(/\s/g, '')), value);
    });
  } finally { await task.destroy(); }
});

test('legacy saved reports export an explicit missing-email label without modifying the original snapshot', async () => {
  const report = fixture(); delete report.generatedBy.email;
  const original = JSON.stringify(report); freeze(report);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await renderReportExcel(report));
  for (const name of ['Reporte', 'Leeme']) {
    const pairs = new Map(); workbook.getWorksheet(name)!.eachRow(row => pairs.set(row.getCell(1).value, row.getCell(2).value));
    assert.equal(pairs.get('Correo del responsable'), 'Correo no registrado');
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await renderReportPdf(report)), isEvalSupported: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const text = (await (await doc.getPage(1)).getTextContent()).items.filter(item => 'str' in item).map(item => 'str' in item ? item.str : '').join(' ');
    assert.ok(text.includes('Correo no registrado')); assert.ok(!text.includes('original.reporter@duocuc.cl'));
  } finally { await task.destroy(); }
  assert.equal(JSON.stringify(report), original);
});

test('file names are safe, bounded and readable and export vocabulary matches frontend definitions', async () => {
  const report = fixture();
  report.scope.campuses = [{ id: 'one', name: 'San Andrés / "Ñandú" '.repeat(40) }];
  for (const format of ['pdf', 'xlsx'] as const) {
    const filename = reportFilename(report, format);
    assert.ok(filename.length <= 120); assert.match(filename, /^[A-Za-z0-9_.-]+$/); assert.ok(filename.endsWith(`_${report.id.slice(0, 8)}.${format}`));
    assert.ok(filename.includes('san-andres-nandu'));
  }
  report.scope.campuses.push({ id: 'two', name: 'Otro' }); assert.ok(reportFilename(report, 'pdf').includes('multi-campus'));
  const frontend = await readFile(join(process.cwd(), '../frontendclink/src/features/analytics/utils/copy.ts'), 'utf8');
  for (const value of Object.values(REPORT_KPIS)) { assert.ok(frontend.includes(`title: '${value.title}'`)); assert.ok(frontend.includes(`help: '${value.help}'`)); }
});

test('PDF retains260 intervals, zero/unavailable, original technical states and unsupported glyphs with repeated table headers', async () => {
  const report = fixture(); report.notes.push('Símbolo original: 😀');
  report.intervals = Array.from({ length: 260 }, (_, i) => ({ ...report.intervals[i % 3], key: `original-key-${i}`, label: `Intervalo único ${i}` }));
  const bytes = await renderReportPdf(freeze(report));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
  try {
    const document = await task.promise; let text = '', repeated = 0;
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index), content = await page.getTextContent();
      const current = content.items.filter(item => 'str' in item).map(item => 'str' in item ? item.str : '').join(' ');
      text += current;
      assert.ok(current.includes('CampusLink | Reporte guardado')); assert.ok(current.includes(`${index} / ${document.numPages}`));
      if (current.includes('Evolución por período (continuación)')) { repeated++; assert.ok(current.includes('Cuentas')); assert.ok(current.includes('Recursos')); }
      for (const item of content.items) if ('str' in item && item.str) { assert.ok(item.transform[4] >= 43 && item.transform[4] + item.width <= 552); assert.ok(item.transform[5] >= 27 && item.transform[5] <= 813); }
    }
    assert.ok(repeated > 1); assert.ok(text.includes('[U+1F600]')); assert.ok(text.includes('Sin datos')); assert.ok(text.includes('no_activity')); assert.ok(text.includes('partial'));
    for (let i = 0; i < 260; i++) { assert.ok(text.includes(`original-key-${i}`)); assert.ok(text.includes(`Intervalo único ${i}`)); }
  } finally { await task.destroy(); }
});
