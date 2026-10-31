import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AnalyticalReport } from '../types/analytics.types.js';
import type { SavedSection } from './analytics.export.js';
import { REPORT_KPIS, REPORT_STATES, reportPeriodLabel, reportSavedLabel } from '../domain/analytics.presentation.js';

/** Maquetación únicamente: todas las cifras y metadatos llegan de la instantánea original. */
export async function renderSavedReportPdf(report: AnalyticalReport, metadata: [string, string][], sections: SavedSection[], glossary: string[][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Reporte analítico CampusLink'); pdf.setAuthor(report.generatedBy.name);
  pdf.setCreationDate(new Date(report.generatedAt)); pdf.setModificationDate(new Date(report.generatedAt));
  pdf.registerFontkit(fontkit);
  const resolveDependency = createRequire(__filename);
  const fonts = join(dirname(resolveDependency.resolve('pdfjs-dist/package.json')), 'standard_fonts');
  const font = await pdf.embedFont(await readFile(join(fonts, 'LiberationSans-Regular.ttf')), { subset: true });
  const supported = new Set(font.getCharacterSet());
  const printable = (text: string) => Array.from(text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')).map(ch =>
    ch === '\n' || supported.has(ch.codePointAt(0)!) ? ch : `[U+${ch.codePointAt(0)!.toString(16).toUpperCase()}]`).join('');
  const W = 595.28, H = 841.89, margin = 44, contentWidth = W - margin * 2, floor = 54;
  const ink = rgb(0.09, 0.21, 0.30), navy = rgb(0, 0.18, 0.34), muted = rgb(0.34, 0.42, 0.48), border = rgb(0.85, 0.89, 0.92);
  let page = pdf.addPage([W, H]), y = H - 66;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 66; };
  const ensure = (height: number) => { if (y - height < floor) newPage(); };
  function wrap(text: string, size: number, width = contentWidth): string[] {
    const lines: string[] = [];
    for (const paragraph of printable(text).split('\n')) {
      let current = '';
      for (const character of paragraph) {
        if (current && font.widthOfTextAtSize(current + character, size) > width) {
          const space = current.lastIndexOf(' ');
          if (space > 0) { lines.push(current.slice(0, space)); current = current.slice(space + 1); }
          else { lines.push(current); current = ''; }
        }
        current += character;
      }
      lines.push(current);
    }
    return lines;
  }
  const draw = (text: string, x: number, baseline: number, size: number, color = ink) => page.drawText(printable(text), { x, y: baseline, size, font, color });
  function line(text: string, size = 10, heading = false) {
    const lines = wrap(text, size);
    const blockHeight = lines.length * (size + 5) + (heading ? 9 : 5);
    // Mantener párrafos cortos juntos y títulos con la explicación que sigue.
    ensure(blockHeight <= H - 66 - floor ? blockHeight + (heading ? 50 : 0) : size + 5);
    for (const row of lines) { ensure(size + 5); draw(row, margin, y, size, heading ? navy : ink); y -= size + 5; }
    y -= heading ? 9 : 5;
  }
  const number = (value: number | null | undefined) => value == null ? 'Sin datos' : new Intl.NumberFormat('es-CL').format(value);

  // Resumen ejecutivo: contexto breve; los nombres íntegros también están en el anexo.
  line('Reporte analítico guardado', 20, true);
  line(reportPeriodLabel(report.period), 13);
  const brief = (text: string) => text.length > 120 ? `${text.slice(0, 116)}... (anexo)` : text;
  line(brief(report.scope.institutionName));
  line(`Campus: ${brief(report.scope.campuses.slice(0, 2).map(c => c.name).join(', '))}${report.scope.campuses.length > 2 ? ` +${report.scope.campuses.length - 2} más (anexo)` : ''}`);
  line(`Carrera: ${brief(report.scope.career?.name ?? 'Todas las carreras (incluye sin clasificar)')}`);
  line(`${report.grouping === 'week' ? 'Semanal' : 'Mensual'} | Guardado el ${reportSavedLabel(report)}`);
  line(`por ${brief(report.generatedBy.name)} | ${report.period.timeZone}`);
  line(report.generatedBy.email || 'Correo no registrado', 9);
  y -= 8;
  const entries = Object.entries(REPORT_KPIS) as [keyof typeof REPORT_KPIS, typeof REPORT_KPIS[keyof typeof REPORT_KPIS]][];
  const cardWidth = (contentWidth - 14) / 2;
  for (let index = 0; index < entries.length; index += 2) {
    const pair = entries.slice(index, index + 2);
    const layouts = pair.map(([key, copy]) => ({ key, title: wrap(copy.title, 11, cardWidth - 24), help: wrap(copy.help, 9, cardWidth - 24) }));
    const height = Math.max(...layouts.map(item => 72 + item.title.length * 14 + item.help.length * 12));
    ensure(height + 14);
    layouts.forEach((item, column) => {
      const x = margin + column * (cardWidth + 14);
      page.drawRectangle({ x, y: y - height, width: cardWidth, height, color: rgb(0.95, 0.97, 0.98), borderColor: border, borderWidth: 0.6 });
      const value = number(report[item.key].value), size = Math.min(28, (cardWidth - 24) / Math.max(1, font.widthOfTextAtSize(printable(value), 1)));
      draw(value, x + 12, y - 35, size, navy);
      let at = y - 58;
      item.title.forEach(text => { draw(text, x + 12, at, 11, navy); at -= 14; });
      if ('views' in report[item.key] && report[item.key].value !== null) {
        const metric = report[item.key] as AnalyticalReport['resourceDemand'];
        draw(`${number(metric.views)} vistas | ${number(metric.requests)} solicitudes`, x + 12, at, 8, muted); at -= 13;
      }
      item.help.forEach(text => { draw(text, x + 12, at, 9, muted); at -= 12; });
    });
    y -= height + 14;
  }
  line(`${REPORT_STATES[sections[0].status]}. ${REPORT_STATES[sections[0].coverage]}.`, 9);

  function table(title: string, headers: string[], widths: number[], rows: string[][]) {
    const headingLines = headers.map((text, i) => wrap(text, 9, widths[i] - 12));
    const headerHeight = Math.max(...headingLines.map(lines => lines.length)) * 12 + 16;
    const header = (continuation = false) => {
      ensure(headerHeight + 62); line(`${title}${continuation ? ' (continuación)' : ''}`, 14, true);
      let x = margin;
      headingLines.forEach((lines, i) => { page.drawRectangle({ x, y: y - headerHeight, width: widths[i], height: headerHeight, color: navy });
        lines.forEach((text, n) => draw(text, x + 6, y - 14 - n * 12, 9, rgb(1, 1, 1))); x += widths[i]; });
      y -= headerHeight;
    };
    header();
    rows.forEach((row, rowIndex) => {
      const cells = headers.map((_, i) => wrap(row[i] ?? '', 9, widths[i] - 12));
      const count = Math.max(...cells.map(lines => lines.length));
      let offset = 0;
      // Una fila excepcionalmente larga puede continuar, siempre con cabecera repetida.
      while (offset < count) {
        const desired = (count - offset) * 12 + 16;
        if (y - Math.min(desired, 160) < floor) { newPage(); header(true); }
        const take = Math.min(count - offset, Math.floor((y - floor - 16) / 12));
        const height = take * 12 + 16;
        let x = margin;
        cells.forEach((lines, i) => {
          page.drawRectangle({ x, y: y - height, width: widths[i], height, color: rowIndex % 2 ? rgb(0.96, 0.98, 0.99) : rgb(1, 1, 1), borderColor: border, borderWidth: 0.4 });
          lines.slice(offset, offset + take).forEach((text, n) => draw(text, x + 6, y - 15 - n * 12, 9)); x += widths[i];
        });
        y -= height; offset += take;
      }
    });
    y -= 16;
  }
  newPage();
  table('Evolución por período', ['Período analizado', 'Cuentas activas', 'Recursos vistos y pedidos', 'Interés por asignaturas', 'Inscripciones a actividades'], [139, 70, 100, 100, contentWidth - 409], sections.slice(1).map(section => {
    const m = section.metrics;
    const demand = (metric: AnalyticalReport['resourceDemand'] | undefined) => metric?.value == null ? 'Sin datos' : `${number(metric.value)} interacciones\n${number(metric.views)} vistas\n${number(metric.requests)} solicitudes`;
    const coverage = section.coverage === section.status ? '' : `\n${section.coverage === 'partial' ? 'Captura histórica parcial' : REPORT_STATES[section.coverage] ?? section.coverage}`;
    return [`${section.label}\n${reportPeriodLabel(section.period)}\n${REPORT_STATES[section.status] ?? section.status}${coverage}${!m ? '\nSin datos disponibles' : ''}${section.status === 'no_activity' ? '\nSin vistas, solicitudes ni inscripciones; puede haber cuentas activas.' : ''}`,
      number(m?.activeUsers.value), demand(m?.resourceDemand), demand(m?.subjectDemand), number(m?.activityParticipation.value)];
  }));
  line('Una interacción puede contar en varias asignaturas. Resumen e intervalos son niveles distintos: no sumar todas las filas.', 10);
  table('Interés por asignatura', ['Sección', 'Asignatura', 'ID original', 'Vistas', 'Solicitudes'], [88, 222, 93, 47, contentWidth - 450], sections.flatMap(section => (section.metrics?.subjectDemand.subjects ?? []).map(subject =>
    [section.label, subject.subjectName, subject.subjectId, number(subject.views), number(subject.requests)])));
  line('Definiciones de los indicadores', 14, true); line(`Versión guardada: ${report.calculationVersion}`);
  for (const [label, definition] of glossary) { line(label, 11, true); line(definition); }
  newPage(); line('Anexo técnico', 18, true);
  for (const [key, value] of metadata) line(`${key}: ${value}`);
  table('Estados y límites originales', ['Intervalo ID / etiqueta', 'Fechas civiles / zona / corte exclusivo', 'Estado / cobertura originales'], [160, 220, contentWidth - 380], sections.map(section =>
    [`${section.key}\n${section.label}`, `${section.period.from}\n${section.period.to}\n${section.period.timeZone}\n${section.period.cutoff}`, `${section.status}\n${section.coverage}`]));
  line('Notas guardadas originales', 14, true); for (const note of report.notes) line(note);
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawText('CampusLink | Reporte guardado', { x: margin, y: H - 30, size: 9, font, color: navy });
    current.drawText(`${report.id} | ${index + 1} / ${pages.length}`, { x: margin, y: 28, size: 8, font, color: muted });
  });
  return Buffer.from(await pdf.save());
}
