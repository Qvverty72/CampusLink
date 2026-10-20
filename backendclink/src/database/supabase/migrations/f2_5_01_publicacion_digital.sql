-- Ejecutar como propietario; no crea tablas, columnas, buckets ni modifica datos.
begin;
alter table public.recurso_digital enable row level security;
revoke all on public.recurso_digital from public, anon, authenticated;
grant select, insert on public.recurso_digital to service_role;

-- La frontera de tablas compartidas ya está definida por F2.4-01; no cambia sus grants.
-- Impide que futuras policies permisivas de Storage expongan originales digitales.
drop policy if exists digital_originals_server_only on storage.objects;
create policy digital_originals_server_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'digital-resources')
  with check (bucket_id <> 'digital-resources');
commit;
