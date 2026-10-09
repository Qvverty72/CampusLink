-- F2.3-01: apply after the existing CampusLink tables, with a database-owner connection.
-- This migration provides read-only access to one's own identity context, not business authorization.
begin;

alter table public.perfil_usuario enable row level security;
alter table public.usuario_rol enable row level security;
alter table public.usuario_permiso enable row level security;
alter table public.rol enable row level security;
alter table public.permiso enable row level security;

-- Public clients cannot provision profiles, change account state or grant themselves privileges.
revoke all on public.perfil_usuario, public.usuario_rol, public.usuario_permiso,
  public.rol, public.permiso from anon, authenticated;
grant select on public.perfil_usuario, public.usuario_rol, public.usuario_permiso,
  public.rol, public.permiso to authenticated;

create policy auth_context_profile_read on public.perfil_usuario
  for select to authenticated using (id = (select auth.uid()));
create policy auth_context_profile_boundary on public.perfil_usuario as restrictive
  for select to authenticated using (id = (select auth.uid()));

create policy auth_context_roles_read on public.usuario_rol
  for select to authenticated using (perfil_usuario_id = (select auth.uid()) and revocado_en is null);
create policy auth_context_roles_boundary on public.usuario_rol as restrictive
  for select to authenticated using (perfil_usuario_id = (select auth.uid()) and revocado_en is null);

create policy auth_context_permissions_read on public.usuario_permiso
  for select to authenticated using (perfil_usuario_id = (select auth.uid()) and revocado_en is null);
create policy auth_context_permissions_boundary on public.usuario_permiso as restrictive
  for select to authenticated using (perfil_usuario_id = (select auth.uid()) and revocado_en is null);

create policy auth_context_role_names_read on public.rol
  for select to authenticated using (exists (
    select 1 from public.usuario_rol ur where ur.rol_id = rol.id
      and ur.perfil_usuario_id = (select auth.uid()) and ur.revocado_en is null
  ));
create policy auth_context_role_names_boundary on public.rol as restrictive
  for select to authenticated using (exists (
    select 1 from public.usuario_rol ur where ur.rol_id = rol.id
      and ur.perfil_usuario_id = (select auth.uid()) and ur.revocado_en is null
  ));

create policy auth_context_permission_names_read on public.permiso
  for select to authenticated using (exists (
    select 1 from public.usuario_permiso up where up.permiso_id = permiso.id
      and up.perfil_usuario_id = (select auth.uid()) and up.revocado_en is null
  ));
create policy auth_context_permission_names_boundary on public.permiso as restrictive
  for select to authenticated using (exists (
    select 1 from public.usuario_permiso up where up.permiso_id = permiso.id
      and up.perfil_usuario_id = (select auth.uid()) and up.revocado_en is null
  ));

commit;
