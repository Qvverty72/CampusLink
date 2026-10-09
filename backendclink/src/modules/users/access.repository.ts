import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { AccessAssignment, AccessCampus, AccessCatalogItem, AccessConnection, AccessKind, AccessProfile, AccessSnapshot, AccountStateUpdate, PhysicalPublication } from './access.types.js';
import type { AuthAssignment } from '../auth/auth.types.js';
import type { AuditEntry, AuditDetail } from './access.types.js';

const auditColumns = `id,actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

export function withAccessTransaction<T>(operation: (repository: ReturnType<typeof accessRepository>) => Promise<T>) {
  return withPostgresTransaction(client => operation(accessRepository(client)));
}

// SQL and locks only. Authorization, desired state and audit decisions belong to the service.
export function accessRepository(client: AccessConnection) {
  return {
    auditEntries: async (campus: AccessCampus, limit: number, offset: number) => (await client.query<AuditEntry>(
      `SELECT ${auditColumns} FROM public.auditoria WHERE campus_id=$1 AND institucion_id=$2
       ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`, [campus.id,campus.institucion_id,limit,offset])).rows,
    auditEntry: async (campus: AccessCampus, id: string) => (await client.query<AuditDetail>(
      `SELECT ${auditColumns},justificacion_accion,reporte_contenido_id,datos_antes,datos_despues
       FROM public.auditoria WHERE campus_id=$1 AND institucion_id=$2 AND id=$3`, [campus.id,campus.institucion_id,id])).rows[0],
    lockProfiles: async (ids: string[]) => (await client.query<AccessProfile>(
      `SELECT id, institucion_id, campus_id, nombre_completo, estado_cuenta, deleted_at,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM public.perfil_usuario WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids])).rows,
    lockCampus: async (id: string) => (await client.query<AccessCampus>(
      'SELECT id, nombre, institucion_id, activo FROM public.campus WHERE id=$1 FOR SHARE', [id])).rows[0],
    adminAssignments: async (userId: string) => (await client.query<AuthAssignment>(
      `SELECT r.id,r.nombre AS name,ur.campus_id AS "campusId" FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
       WHERE ur.perfil_usuario_id=$1 AND ur.revocado_en IS NULL AND r.nombre='ADMINISTRADOR'
       ORDER BY ur.id FOR SHARE OF ur, r`, [userId])).rows,
    campuses: async (ids: string[]) => (await client.query<AccessCampus>(
      'SELECT id, nombre, institucion_id, activo FROM public.campus WHERE id=ANY($1::uuid[]) ORDER BY nombre,id FOR SHARE', [ids])).rows,
    catalog: async () => ({
      roles: (await client.query<AccessCatalogItem>('SELECT id,nombre FROM public.rol ORDER BY nombre FOR SHARE')).rows,
      permissions: (await client.query<AccessCatalogItem>('SELECT id,nombre FROM public.permiso ORDER BY nombre FOR SHARE')).rows,
    }),
    users: async (campusId: string, limit: number, offset: number) => (await client.query<Omit<AccessProfile, 'updated_at'>>(
      `SELECT id, institucion_id, campus_id, nombre_completo, estado_cuenta, deleted_at FROM public.perfil_usuario
       WHERE campus_id=$1 AND deleted_at IS NULL ORDER BY nombre_completo,id LIMIT $2 OFFSET $3`, [campusId, limit, offset])).rows,
    snapshot: async (userId: string, campusId: string): Promise<AccessSnapshot> => ({
      roles: (await client.query<AccessAssignment>(
        `SELECT ur.id,ur.rol_id AS catalog_id,r.nombre,ur.campus_id FROM public.usuario_rol ur
         JOIN public.rol r ON r.id=ur.rol_id WHERE ur.perfil_usuario_id=$1 AND ur.campus_id=$2
         AND ur.revocado_en IS NULL ORDER BY ur.id FOR SHARE OF ur,r`, [userId, campusId])).rows,
      permissions: (await client.query<AccessAssignment>(
        `SELECT up.id,up.permiso_id AS catalog_id,p.nombre,up.campus_id FROM public.usuario_permiso up
         JOIN public.permiso p ON p.id=up.permiso_id WHERE up.perfil_usuario_id=$1 AND up.campus_id=$2
         AND up.revocado_en IS NULL ORDER BY up.id FOR SHARE OF up,p`, [userId, campusId])).rows,
    }),
    revoke: async (kind: AccessKind, id: string) => {
      // Identifiers come exclusively from these constants, never request input.
      const table = kind === 'roles' ? 'usuario_rol' : 'usuario_permiso';
      await client.query(`UPDATE public.${table} SET revocado_en=clock_timestamp() WHERE id=$1 AND revocado_en IS NULL`, [id]);
    },
    grant: async (kind: AccessKind, userId: string, catalogId: string, campusId: string, actorId: string) => {
      const fields = kind === 'roles' ? ['usuario_rol', 'rol_id', 'asignado_por_id'] : ['usuario_permiso', 'permiso_id', 'otorgado_por_id'];
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.${fields[0]} (perfil_usuario_id,${fields[1]},campus_id,${fields[2]}) VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, catalogId, campusId, actorId]);
      return result.rows[0].id;
    },
    lockPhysicalPublications: async (userId: string) => (await client.query<PhysicalPublication>(
      `SELECT id,campus_id,propietario_id,estado_publicacion,deleted_at,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM public.publicacion_recurso WHERE propietario_id=$1 AND tipo_recurso='FISICO'
       AND deleted_at IS NULL ORDER BY id FOR UPDATE`, [userId])).rows,
    setAccountState: async (userId: string, state: AccountStateUpdate['accountState']) => {
      const result = await client.query<{ updated_at: string }>(
        `UPDATE public.perfil_usuario SET estado_cuenta=$2,
          updated_at=greatest(clock_timestamp(),updated_at + interval '1 microsecond') WHERE id=$1
         RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`, [userId,state]);
      if (!result.rows[0]) throw new Error('Account write failed');
      return result.rows[0].updated_at;
    },
    retirePhysicalPublications: async (ids: string[], changedAt: string) => {
      await client.query(`UPDATE public.publicacion_recurso SET deleted_at=$2::timestamptz,
        updated_at=greatest($2::timestamptz,updated_at + interval '1 microsecond') WHERE id=ANY($1::uuid[])`, [ids,changedAt]);
      return (await client.query<PhysicalPublication>(
        `SELECT id,campus_id,propietario_id,estado_publicacion,deleted_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM public.publicacion_recurso WHERE id=ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
    },
    auditAccountState: async (actorId: string, campus: AccessCampus, userId: string, action: string,
      before: AccessProfile, after: AccessProfile, publicationsBefore: PhysicalPublication[], publicationsAfter: PhysicalPublication[]) => {
      await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,
        accion,datos_antes,datos_despues,created_at) VALUES ($1,$2,$3,'perfil_usuario',$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz)`,
        [actorId,campus.institucion_id,campus.id,userId,action,
          JSON.stringify({ ...before, publicacion_recurso: publicationsBefore }),
          JSON.stringify({ ...after, publicacion_recurso: publicationsAfter }),after.updated_at]);
    },
    audit: async (actorId: string, campus: AccessCampus, userId: string, action: string, before: AccessSnapshot, after: AccessSnapshot, change: { assignmentId: string; catalogId: string }) => {
      await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues)
        VALUES ($1,$2,$3,'perfil_usuario',$4,$5,$6::jsonb,$7::jsonb)`,
        [actorId, campus.institucion_id, campus.id, userId, action, JSON.stringify({ ...before, ...change }), JSON.stringify({ ...after, ...change })]);
    },
  };
}
