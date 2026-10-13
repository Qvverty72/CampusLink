-- Administrative lists are always scoped by campus and sorted by date/id.
-- No grants or policies are broadened; F2.8-01 privacy migration remains required.
begin;
create index if not exists reporte_contenido_campus_fecha_idx
  on public.reporte_contenido (campus_id, reportado_en desc, id desc);
create index if not exists reporte_contenido_campus_estado_fecha_idx
  on public.reporte_contenido (campus_id, estado_reporte, reportado_en desc, id desc);
commit;
