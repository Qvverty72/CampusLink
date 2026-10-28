import ExcelJS from 'exceljs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AnalyticalReport, DashboardMetrics, DashboardPeriod } from './analytics.types.js';
import { REPORT_KPIS, REPORT_STATES, reportPeriodLabel, reportSavedLabel } from './analytics.presentation.js';

/** Interpretación histórica de la versión guardada; no consulta ni ejecuta el cálculo actual. */
const definitions = {
  'campuslink-kpi-v1': [
    ...Object.values(REPORT_KPIS).map(item => [item.title, item.help]),
    ['Disponibilidad', 'Cero representa ausencia de actividad registrada. Una celda numérica vacía o Sin datos indica falta de datos, no cero. La cobertura histórica parcial no demuestra un registro completo.'],
    ['Filtros y calendario', 'Asociaciones académicas y ámbito conservados al generar. Los valores por carrera no se suman como exclusivos. Fechas civiles inclusivas y corte exclusivo; semanas de lunes a domingo y meses calendario en America/Santiago.'],
  ],
};

export type SavedSection = { label: string; key: string; period: DashboardPeriod; status: string; coverage: string; metrics: DashboardMetrics | null };

function savedSections(report: AnalyticalReport): SavedSection[] {
  return [{ label: 'Resumen guardado', key: 'total', period: report.period,
    status: report.activeUsers.value === null ? 'unavailable' : 'summary', coverage: report.activeUsers.value === null ? 'unavailable' : 'partial', metrics: report },
  ...report.intervals.map(interval => ({ ...interval, metrics: interval.metrics }))];
}

function savedDefinitions(report: AnalyticalReport) {
  const result = definitions[report.calculationVersion];
  if (!result) throw new Error('Unsupported saved calculation version.');
  return result;
}

function metadata(report: AnalyticalReport): [string, string][] {
  return [
    ['Reporte ID', report.id], ['Institución ID', report.scope.institutionId], ['Institución', report.scope.institutionName],
    ...report.scope.campuses.flatMap((campus, index): [string, string][] => [[`Campus ${index + 1} ID`, campus.id], [`Campus ${index + 1}`, campus.name]]),
    ['Carrera ID', report.scope.career?.id ?? ''], ['Carrera', report.scope.career?.name ?? 'Sin filtro de carrera'],
    ['Desde (inclusivo)', report.period.from], ['Hasta (inclusivo)', report.period.to], ['Zona horaria', report.period.timeZone],
    ['Corte exclusivo', report.period.cutoff], ['Agrupación', report.grouping === 'week' ? 'Semanal (lunes a domingo)' : 'Mensual'],
    ['Fecha original de generación (ISO)', report.generatedAt],
    ['Fecha original de generación (local)', new Intl.DateTimeFormat('es-CL', { timeZone: report.period.timeZone,
      dateStyle: 'long', timeStyle: 'long', hourCycle: 'h23' }).format(new Date(report.generatedAt))],
    ['Responsable ID', report.generatedBy.userId], ['Responsable', report.generatedBy.name], ['Correo del responsable', report.generatedBy.email || 'Correo no registrado'], ['Versión de cálculo', report.calculationVersion],
  ];
}

/** XLSX real: números y celdas vacías, sin fórmulas ni reconstrucción desde el PDF. */
export async function renderReportExcel(report: AnalyticalReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CampusLink';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  function sheet(name: string, headers: string[], rows: (string | number | null)[][]) {
    const result = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    result.addRow(headers);
    result.addRows(rows);
    result.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    result.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF09243A' } };
    result.getRow(1).height = 32;
    result.columns.forEach((column, index) => { column.width = headers[index].includes('ID') ? 39 : 26; });
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, result.rowCount), column: headers.length } };
    result.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; row.eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '#,##0'; }); });
    return result;
  }
  const guide = sheet('Leeme', ['Guía del reporte', 'Cómo usar este archivo'], [
    ['Qué contiene', 'Las cifras originales de un reporte guardado; descargar no las vuelve a calcular.'],
    ['Período analizado', reportPeriodLabel(report.period)], ['Institución', report.scope.institutionName],
    ['Campus', report.scope.campuses.map(campus => campus.name).join(', ')], ['Carrera', report.scope.career?.name ?? 'Todas las carreras (incluye sin clasificar)'],
    ['Agrupación', report.grouping === 'week' ? 'Semanal' : 'Mensual'], ['Guardado el', reportSavedLabel(report)], ['Responsable', report.generatedBy.name],
    ['Correo del responsable', report.generatedBy.email || 'Correo no registrado'],
    ['Indicadores', 'Total original del reporte. No sumar Indicadores con Periodos.'],
    ['Periodos', 'Detalle por semana o mes; conserva los límites originales de cada intervalo.'],
    ['Asignaturas', 'Contiene resumen y detalle. Intervalo ID = total identifica el resumen; no sumar todas las filas. Una interacción puede contar en varias asignaturas.'],
    ['Cuentas activas', 'Es un saldo al cierre: no se suma entre filas ni representa personas conectadas.'],
    ['Disponibilidad', 'Vacío = sin datos disponibles. 0 = cero observado.'],
    ['Reporte / Definiciones / Notas', 'Metadatos originales, significado de los indicadores y notas históricas.'],
    ...Object.values(REPORT_KPIS).map(item => [item.title, item.help]),
  ]);
  guide.getColumn(1).width = 34; guide.getColumn(2).width = 100;
  guide.eachRow((row, index) => { if (index > 1) row.height = Math.max(32, Math.ceil(String(row.getCell(2).value ?? '').length / 85) * 17); });
  const meta = sheet('Reporte', ['Parámetro', 'Valor guardado'], metadata(report));
  meta.getColumn(2).width = 95;
  const headers = ['Intervalo ID', 'Período', 'Desde', 'Hasta', 'Zona horaria', 'Corte exclusivo', 'Estado', 'Cobertura',
    'Usuarios activos', 'Recursos total', 'Recursos vistas', 'Recursos solicitudes', 'Asignaturas total', 'Asignaturas vistas',
    'Asignaturas solicitudes', 'Inscripciones'];
  const sections = savedSections(report);
  const counts = (section: SavedSection) => {
    const m = section.metrics;
    return [section.key, section.label, section.period.from, section.period.to, section.period.timeZone, section.period.cutoff,
      section.status, section.coverage, m?.activeUsers.value ?? null, m?.resourceDemand.value ?? null,
      m?.resourceDemand.value == null ? null : m.resourceDemand.views, m?.resourceDemand.value == null ? null : m.resourceDemand.requests,
      m?.subjectDemand.value ?? null, m?.subjectDemand.value == null ? null : m.subjectDemand.views,
      m?.subjectDemand.value == null ? null : m.subjectDemand.requests, m?.activityParticipation.value ?? null];
  };
  const grouped = (target: ExcelJS.Worksheet) => target.getRow(1).eachCell((cell, index) => {
    const color = index <= 6 ? '09243A' : index <= 8 ? '495F70' : index === 9 ? '244B64' : index <= 12 ? '174F5F' : index <= 15 ? '4B476C' : '5A4930';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
  });
  grouped(sheet('Indicadores', headers, [counts(sections[0])]));
  grouped(sheet('Periodos', headers, sections.slice(1).map(counts)));
  const subjectsSheet = sheet('Asignaturas', ['Intervalo ID', 'Período', 'Desde', 'Hasta', 'Corte exclusivo', 'Estado', 'Cobertura', 'Asignatura ID', 'Asignatura', 'Vistas', 'Solicitudes'],
    sections.flatMap(section => (section.metrics?.subjectDemand.subjects ?? []).map(subject => [section.key, section.label,
      section.period.from, section.period.to, section.period.cutoff, section.status, section.coverage,
      subject.subjectId, subject.subjectName, subject.views, subject.requests])));
  subjectsSheet.getCell('A1').note = 'total = resumen guardado; cualquier otro ID = intervalo. No sumar ambos niveles.';
  subjectsSheet.getColumn(1).eachCell((cell, index) => { if (index > 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.value === 'total' ? 'FFE5EFF5' : 'FFF5F8FA' } }; });
  const glossary = sheet('Definiciones', ['Indicador', 'Definición', 'Versión de cálculo'],
    savedDefinitions(report).map(([label, definition]) => [label, definition, report.calculationVersion]));
  glossary.getColumn(2).width = 110;
  for (const [technical, human] of Object.entries(REPORT_STATES)) glossary.addRow([technical, human, report.calculationVersion]);
  const notes = sheet('Notas', ['Nota guardada'], report.notes.map(note => [note]));
  notes.getColumn(1).width = 120;
  // Altura según contenido y anchos conservados: wrapText solo no evita recorte en Excel.
  for (const target of workbook.worksheets) target.eachRow((row, index) => {
    if (index === 1) return;
    let lines = 1;
    row.eachCell(cell => { lines = Math.max(lines, ...String(cell.value ?? '').split('\n').map(text => Math.ceil(text.length / Math.max(1, (target.getColumn(cell.col).width ?? 26) - 2)))); });
    row.height = Math.max(row.height ?? 20, lines * 15 + 6);
    row.alignment = { vertical: 'top', wrapText: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** PDF paginado con ajuste real al ancho de fuente; solo presenta los valores guardados. */
export async function renderReportPdf(report: AnalyticalReport): Promise<Buffer> {
  const glossary = savedDefinitions(report);
  const { renderSavedReportPdf } = await import('./analytics.pdf.js');
  return renderSavedReportPdf(report, metadata(report), savedSections(report), glossary);
}
