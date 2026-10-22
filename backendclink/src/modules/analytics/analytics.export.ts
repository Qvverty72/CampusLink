import ExcelJS from 'exceljs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AnalyticalReport, DashboardMetrics, DashboardPeriod } from './analytics.types.js';

/** Interpretación histórica de la versión guardada; no consulta ni ejecuta el cálculo actual. */
const definitions = {
  'campuslink-kpi-v1': [
    ['Usuarios activos', 'Cuentas activas al corte exclusivo según la auditoría disponible. Es un saldo; no se suma entre períodos.'],
    ['Demanda de recursos', 'Interacciones de recursos: vistas y solicitudes, conservadas por separado y con su total guardado.'],
    ['Demanda de asignaturas', 'Vistas y solicitudes de recursos asociados a cada asignatura. Un recurso con varias asignaturas cuenta en cada una; no son conjuntos exclusivos.'],
    ['Participación en actividades', 'Inscripciones registradas; no representa asistencia presencial. Se conserva el indicador de historial importado.'],
    ['Disponibilidad', 'Cero representa ausencia de actividad registrada. Una celda numérica vacía o Sin datos indica falta de datos, no cero. La cobertura histórica parcial no demuestra un registro completo.'],
    ['Filtros y calendario', 'Asociaciones académicas y ámbito conservados al generar. Los valores por carrera no se suman como exclusivos. Fechas civiles inclusivas y corte exclusivo; semanas de lunes a domingo y meses calendario en America/Santiago.'],
  ],
};

type SavedSection = { label: string; key: string; period: DashboardPeriod; status: string; coverage: string; metrics: DashboardMetrics | null };

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
    ['Responsable ID', report.generatedBy.userId], ['Responsable', report.generatedBy.name], ['Versión de cálculo', report.calculationVersion],
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
    result.columns.forEach((column, index) => { column.width = headers[index].includes('ID') ? 39 : 26; });
    result.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, result.rowCount), column: headers.length } };
    result.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
    return result;
  }
  const meta = sheet('Reporte', ['Parámetro', 'Valor guardado'], metadata(report));
  meta.getColumn(2).width = 95;
  const headers = ['Intervalo ID', 'Período', 'Desde', 'Hasta', 'Zona horaria', 'Corte exclusivo', 'Estado', 'Cobertura',
    'Usuarios activos', 'Recursos total', 'Recursos vistas', 'Recursos solicitudes', 'Asignaturas total', 'Asignaturas vistas',
    'Asignaturas solicitudes', 'Inscripciones', 'Eventos importados'];
  const sections = savedSections(report);
  const counts = (section: SavedSection) => {
    const m = section.metrics;
    return [section.key, section.label, section.period.from, section.period.to, section.period.timeZone, section.period.cutoff,
      section.status, section.coverage, m?.activeUsers.value ?? null, m?.resourceDemand.value ?? null,
      m?.resourceDemand.value == null ? null : m.resourceDemand.views, m?.resourceDemand.value == null ? null : m.resourceDemand.requests,
      m?.subjectDemand.value ?? null, m?.subjectDemand.value == null ? null : m.subjectDemand.views,
      m?.subjectDemand.value == null ? null : m.subjectDemand.requests, m?.activityParticipation.value ?? null,
      m?.activityParticipation.value == null ? null : m.activityParticipation.legacyEvents];
  };
  sheet('Indicadores', headers, [counts(sections[0])]);
  sheet('Periodos', headers, sections.slice(1).map(counts));
  sheet('Asignaturas', ['Intervalo ID', 'Período', 'Desde', 'Hasta', 'Corte exclusivo', 'Estado', 'Cobertura', 'Asignatura ID', 'Asignatura', 'Vistas', 'Solicitudes'],
    sections.flatMap(section => (section.metrics?.subjectDemand.subjects ?? []).map(subject => [section.key, section.label,
      section.period.from, section.period.to, section.period.cutoff, section.status, section.coverage,
      subject.subjectId, subject.subjectName, subject.views, subject.requests])));
  const glossary = sheet('Definiciones', ['Indicador', 'Definición', 'Versión de cálculo'],
    savedDefinitions(report).map(([label, definition]) => [label, definition, report.calculationVersion]));
  glossary.getColumn(2).width = 110;
  const notes = sheet('Notas', ['Nota guardada'], report.notes.map(note => [note]));
  notes.getColumn(1).width = 120;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** PDF paginado con ajuste real al ancho de fuente; solo presenta los valores guardados. */
export async function renderReportPdf(report: AnalyticalReport): Promise<Buffer> {
  const glossary = savedDefinitions(report);
  const pdf = await PDFDocument.create();
  pdf.setTitle('Reporte analítico CampusLink');
  pdf.setAuthor(report.generatedBy.name);
  pdf.setCreationDate(new Date(report.generatedAt));
  pdf.setModificationDate(new Date(report.generatedAt));
  pdf.registerFontkit(fontkit);
  // Fuente y licencia ya distribuidas por nuestra dependencia de producción pdfjs-dist.
  const resolveDependency = createRequire(__filename);
  const fonts = join(dirname(resolveDependency.resolve('pdfjs-dist/package.json')), 'standard_fonts');
  const font = await pdf.embedFont(await readFile(join(fonts, 'LiberationSans-Regular.ttf')), { subset: true });
  const supported = new Set(font.getCharacterSet());
  const printable = (value: string) => Array.from(value.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')).map(character =>
    character === '\n' || supported.has(character.codePointAt(0)!) ? character : `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`).join('');
  const width = 595.28, height = 841.89, margin = 44;
  let page = pdf.addPage([width, height]), y = height - 66;
  function line(text: string, size = 10, heading = false) {
    const clean = printable(text);
    for (const paragraph of clean.split('\n')) {
      let current = '';
      // Parte incluso un nombre/UUID largo sin espacios; nunca corta ni omite texto.
      const wrapped: string[] = [];
      for (const character of paragraph) {
        if (current && font.widthOfTextAtSize(current + character, size) > width - margin * 2) {
          const space = current.lastIndexOf(' ');
          if (space > 0) { wrapped.push(current.slice(0, space)); current = current.slice(space + 1); }
          else { wrapped.push(current); current = ''; }
        }
        current += character;
      }
      wrapped.push(current);
      if (heading && y < 100) { page = pdf.addPage([width, height]); y = height - 66; }
      for (const part of wrapped) {
        if (y < 56) { page = pdf.addPage([width, height]); y = height - 66; }
        page.drawText(part, { x: margin, y, size, font, color: heading ? rgb(0.04, 0.27, 0.34) : rgb(0.08, 0.14, 0.19) });
        y -= size + 5;
      }
    }
    y -= heading ? 7 : 3;
  }
  const number = (value: number | null | undefined) => value == null ? 'Sin datos' : new Intl.NumberFormat('es-CL').format(value);
  line('Reporte analítico guardado', 20, true);
  for (const [key, value] of metadata(report)) line(`${key}: ${value}`);
  for (const section of savedSections(report)) {
    line(section.label, 14, true);
    line(`${section.period.from} al ${section.period.to} | ${section.period.timeZone} | Corte exclusivo: ${section.period.cutoff}`);
    line(`Estado: ${section.status} | Cobertura: ${section.coverage}`);
    const m = section.metrics;
    if (!m) { line('Sin datos disponibles para este intervalo.'); continue; }
    line(`Usuarios activos al corte: ${number(m.activeUsers.value)}`);
    line(`Demanda de recursos: ${number(m.resourceDemand.value)} | Vistas: ${number(m.resourceDemand.value === null ? null : m.resourceDemand.views)} | Solicitudes: ${number(m.resourceDemand.value === null ? null : m.resourceDemand.requests)}`);
    line(`Demanda de asignaturas: ${number(m.subjectDemand.value)} | Vistas: ${number(m.subjectDemand.value === null ? null : m.subjectDemand.views)} | Solicitudes: ${number(m.subjectDemand.value === null ? null : m.subjectDemand.requests)}`);
    for (const subject of m.subjectDemand.subjects) line(`  ${subject.subjectName} (${subject.subjectId}): ${number(subject.views)} vistas | ${number(subject.requests)} solicitudes`);
    line(`Inscripciones registradas: ${number(m.activityParticipation.value)} | Eventos importados: ${number(m.activityParticipation.value === null ? null : m.activityParticipation.legacyEvents)}`);
    if (section.status === 'no_activity') line('Sin actividad registrada; conserva los ceros y el saldo de usuarios activos.');
  }
  line('Definiciones de los indicadores', 14, true);
  line(`Versión guardada: ${report.calculationVersion}`);
  for (const [label, definition] of glossary) { line(label, 11, true); line(definition); }
  line('Notas guardadas', 14, true);
  for (const note of report.notes) line(note);
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText('CampusLink | Reporte guardado', { x: margin, y: height - 30, size: 9, font });
    page.drawText(`${report.id} | ${index + 1} / ${pages.length}`, { x: margin, y: 28, size: 8, font });
  });
  return Buffer.from(await pdf.save());
}
