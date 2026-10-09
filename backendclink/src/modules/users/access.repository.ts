import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { AccessAssignment, AccessCampus, AccessCatalogItem, AccessConnection, AccessKind, AccessProfile, AccessSnapshot } from './access.types.js';

export function withAccessTransaction<T>(operation: (repository: ReturnType<typeof accessRepository>) => Promise<T>) {
  return withPostgresTransaction(client => operation(accessRepository(client)));
}

// SQL and locks only. Authorization, desired state and audit decisions belong to the service.
export function accessRepository(client: AccessConnection) {
  return {
    lockProfiles: async (ids: string[]) => (await client.query<AccessProfile>(
      `SELECT id, institucion_id, campus_id, nombre_completo, estado_cuenta, deleted_at
       FROM public.perfil_usuario WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids])).rows,
    lockCampus: async (id: string) => (await client.query<AccessCampus>(
      'SELECT id, nombre, institucion_id, activo FROM public.campus WHERE id=$1 FOR SHARE', [id])).rows[0],
    adminAssignments: async (userId: string) => (await client.query<{ campus_id: string }>(
      `SELECT ur.campus_id FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
       WHERE ur.perfil_usuario_id=$1 AND ur.revocado_en IS NULL AND r.nombre='ADMINISTRADOR'
       ORDER BY ur.id FOR SHARE OF ur, r`, [userId])).rows,
    campuses: async (ids: string[]) => (await client.query<AccessCampus>(
      'SELECT id, nombre, institucion_id, activo FROM public.campus WHERE id=ANY($1::uuid[]) ORDER BY nombre,id FOR SHARE', [ids])).rows,
    catalog: async () => ({
      roles: (await client.query<AccessCatalogItem>('SELECT id,nombre FROM public.rol ORDER BY nombre FOR SHARE')).rows,
      permissions: (await client.query<AccessCatalogItem>('SELECT id,nombre FROM public.permiso ORDER BY nombre FOR SHARE')).rows,
    }),
    users: async (campusId: string, limit: number, offset: number) => (await client.query<AccessProfile>(
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
    audit: async (actorId: string, campus: AccessCampus, userId: string, action: string, before: AccessSnapshot, after: AccessSnapshot, change: { assignmentId: string; catalogId: string }) => {
      await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues)
        VALUES ($1,$2,$3,'perfil_usuario',$4,$5,$6::jsonb,$7::jsonb)`,
        [actorId, campus.institucion_id, campus.id, userId, action, JSON.stringify({ ...before, ...change }), JSON.stringify({ ...after, ...change })]);
    },
  };
}
