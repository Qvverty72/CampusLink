import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { AccessAccountProfile, AccessAssignment, AccessCampus, AccessCatalogItem, AccessConnection, AccessKind, AccessProfile, AccessSnapshot, AccountStateUpdate, PhysicalPublication } from '../types/access.types.js';
import type { AuthAssignment } from '../../auth/types/auth.types.js';
import type { AuditEntry, AuditDetail, AuditReferenceName, AuditReferenceRequest, AuditActorRow, AuditResponsibleProfile, AuditSearch } from '../types/access.types.js';
import { accessAuditKey, accessAuditPredicate } from '../domain/audit.access-groups.js';
import { auditEditSummary, editAuditKey, publicationEditPredicate } from '../domain/audit.edit-groups.js';
import { auditSnapshot } from '../domain/audit.snapshot.js';

const auditColumns = `id,actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
// Misma proyección acotada para auditoría y cuentas; no incluye secretos ni una carrera principal.
const registeredProfileColumns = `p.nombre_completo AS "fullName",NULLIF(btrim(u.email),'') AS email,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.nombre) ORDER BY c.nombre,c.id)
    FROM public.usuario_carrera uc JOIN public.carrera c ON c.id=uc.carrera_id
    WHERE uc.perfil_usuario_id=p.id AND c.institucion_id=$2),'[]'::jsonb) AS careers`;
const registeredProfileScope = `FROM public.perfil_usuario p LEFT JOIN auth.users u ON u.id=p.id
  WHERE p.campus_id=$1 AND p.institucion_id=$2 AND p.id=$3`;
// Listado y total comparten ámbito y búsqueda antes de paginar.
const accessUsersScope = `FROM public.perfil_usuario p
  WHERE p.campus_id=$1 AND p.institucion_id=$2 AND p.deleted_at IS NULL
  AND ($3::text='' OR position(lower($3) in lower(p.nombre_completo))>0 OR EXISTS(
    SELECT 1 FROM auth.users u WHERE u.id=p.id AND position(lower($3) in lower(COALESCE(u.email,'')))>0))`;
// Mismo alcance, filtros y agrupación para la página y su total de cards.
const publicationTypes = `('publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL')`;
const auditTargetUuid = `CASE WHEN a.entidad_id ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN a.entidad_id::uuid END`;
// Solo rutas conocidas y snapshots de la misma entidad; nunca JSON arbitrario como texto de búsqueda.
const recordedTitle = (snapshot: string) => `CASE WHEN jsonb_typeof(${snapshot}->'titulo')='string'
  AND lower(${snapshot}->>'id')=lower(a.entidad_id) THEN NULLIF(btrim(${snapshot}->>'titulo'),'') END`;
const auditOperations = `WITH named AS (
  SELECT a.*,CASE WHEN a.entidad_tipo IN ${publicationTypes} THEN COALESCE(
    ${recordedTitle('a.datos_despues')},${recordedTitle('a.datos_antes')},
    (SELECT p.titulo FROM public.publicacion_recurso p JOIN public.campus c ON c.id=p.campus_id
      WHERE p.id=${auditTargetUuid} AND p.campus_id=$1 AND c.institucion_id=$2))
    WHEN a.entidad_tipo='reporte_contenido' THEN
    (SELECT COALESCE(
      CASE WHEN jsonb_typeof(r.contenido_reportado_json->'publication'->'titulo')='string' THEN NULLIF(btrim(r.contenido_reportado_json->'publication'->>'titulo'),'') END,
      CASE WHEN jsonb_typeof(r.contenido_reportado_json->'title')='string' THEN NULLIF(btrim(r.contenido_reportado_json->>'title'),'') END)
      FROM public.reporte_contenido r JOIN public.campus c ON c.id=r.campus_id
      WHERE r.id=${auditTargetUuid} AND r.campus_id=$1 AND c.institucion_id=$2
      AND r.entidad_tipo IN ('PUBLICACION_FISICA','PUBLICACION_DIGITAL','TRANSACCION','ACTIVIDAD')) END AS entity_name,
    CASE WHEN a.entidad_tipo IN ${publicationTypes} THEN ${recordedTitle('a.datos_antes')} END AS previous_content_name
  FROM public.auditoria a WHERE a.campus_id=$1 AND a.institucion_id=$2
  AND ($4::timestamptz IS NULL OR a.created_at >= $4::timestamptz)
  AND ($5::timestamptz IS NULL OR a.created_at < $5::timestamptz)
), scoped AS (
  SELECT *,${editAuditKey} AS operation_key FROM named n
  WHERE ($6::text IS NULL OR position(lower($6) in lower(COALESCE(entity_name,'')))>0
    OR position(lower($6) in lower(COALESCE(previous_content_name,'')))>0)
  AND ($7::text IS NULL OR EXISTS(SELECT 1 FROM public.perfil_usuario p
    WHERE p.id=n.actor_usuario_id AND p.campus_id=$1 AND p.institucion_id=$2 AND p.created_at<=n.created_at
    AND position(lower($7) in lower(p.nombre_completo))>0))
), operations AS (
  SELECT (array_agg(id ORDER BY created_at DESC,id DESC))[1] AS id,array_agg(accion ORDER BY accion,id) AS access_group_actions,
    count(*)::int AS edit_group_count
  FROM scoped GROUP BY operation_key HAVING ($3::text IS NULL OR bool_or(accion=$3))
)`;

export function withAccessTransaction<T>(operation: (repository: ReturnType<typeof accessRepository>) => Promise<T>) {
  return withPostgresTransaction(client => operation(accessRepository(client)));
}

// Contiene SQL y bloqueos; autorización, estado deseado y decisiones de auditoría pertenecen al servicio.
export function accessRepository(client: AccessConnection) {
  return {
    auditEntries: async (campus: AccessCampus, limit: number, offset: number, action?: string, from?: string, before?: string, search: AuditSearch = {}) => (await client.query<AuditEntry & { access_group_actions: string[]; edit_group_count: number }>(
      `${auditOperations} SELECT ${auditColumns},entity_name,access_group_actions,edit_group_count FROM operations JOIN scoped USING(id)
       ORDER BY created_at DESC,id DESC LIMIT $8 OFFSET $9`, [campus.id,campus.institucion_id,action ?? null,from ?? null,before ?? null,search.contentName ?? null,search.userName ?? null,limit,offset])).rows
      .map(({entity_name,...entry})=>({...entry,...(entity_name ? {entity_name} : {})})),
    auditEntryCount: async (campus: AccessCampus, action?: string, from?: string, before?: string, search: AuditSearch = {}) => Number((await client.query<{ total: string }>(
      `${auditOperations} SELECT count(*)::text AS total FROM operations`, [campus.id,campus.institucion_id,action ?? null,from ?? null,before ?? null,search.contentName ?? null,search.userName ?? null])).rows[0].total),
    auditEdits: async (campus: AccessCampus, entityId: string, limit: number, offset: number) => (await client.query<AuditEntry & { datos_antes: unknown; datos_despues: unknown }>(
      `${auditOperations} SELECT ${auditColumns},entity_name,datos_antes,datos_despues FROM scoped WHERE ${publicationEditPredicate} AND lower(entidad_id)=lower($8::text)
       ORDER BY created_at DESC,id DESC LIMIT $9 OFFSET $10`,[campus.id,campus.institucion_id,null,null,null,null,null,entityId,limit,offset])).rows
      .map(({entity_name,datos_antes,datos_despues,...entry})=>({...entry,...(entity_name ? {entity_name} : {}),
        changes:auditEditSummary(auditSnapshot(datos_antes),auditSnapshot(datos_despues))})),
    auditEditsCount: async (campus: AccessCampus, entityId: string) => Number((await client.query<{ total: string }>(
      `${auditOperations} SELECT count(*)::text AS total FROM scoped WHERE ${publicationEditPredicate} AND lower(entidad_id)=lower($8::text)`,
      [campus.id,campus.institucion_id,null,null,null,null,null,entityId])).rows[0].total),
    auditSearchUsers: async (campus: AccessCampus, name: string) => (await client.query<{ id: string; createdAt: number }>(
      `SELECT id::text,ceil(extract(epoch FROM created_at)*1000)::double precision AS "createdAt" FROM public.perfil_usuario
       WHERE campus_id=$1 AND institucion_id=$2 AND position(lower($3) in lower(nombre_completo))>0`,[campus.id,campus.institucion_id,name])).rows,
    auditAccessPeers: async (campus: AccessCampus, entry: AuditDetail) => (await client.query<{ id: string; accion: string }>(
      `WITH scoped AS (
         SELECT *,${accessAuditKey} AS operation_key FROM public.auditoria WHERE campus_id=$1 AND institucion_id=$2
         AND actor_usuario_id=$4 AND entidad_tipo=$5 AND entidad_id=$6 AND created_at=$7::timestamptz
       ) SELECT id::text,accion FROM scoped
       WHERE operation_key=(SELECT operation_key FROM scoped WHERE id=$3) AND ${accessAuditPredicate} ORDER BY id DESC`,
      [campus.id,campus.institucion_id,entry.id,entry.actor_usuario_id,entry.entidad_tipo,entry.entidad_id,entry.created_at])).rows,
    auditEntry: async (campus: AccessCampus, id: string) => (await client.query<AuditDetail>(
      `SELECT ${auditColumns},justificacion_accion,reporte_contenido_id,datos_antes,datos_despues
       FROM public.auditoria WHERE campus_id=$1 AND institucion_id=$2 AND id=$3`, [campus.id,campus.institucion_id,id])).rows[0],
    auditPublicationImage: async (campus: AccessCampus, publicationId: string, imageId: string) => (await client.query<{ bucket_id: string; storage_path: string; mime_type: string }>(
      `SELECT a.bucket_id,a.storage_path,a.mime_type FROM public.archivo_publicacion a
       JOIN public.publicacion_recurso p ON p.id=a.publicacion_id JOIN public.campus c ON c.id=p.campus_id
       WHERE p.id=$3 AND a.id=$4 AND p.campus_id=$1 AND c.institucion_id=$2
       AND p.tipo_recurso='FISICO' AND a.tipo_archivo='IMAGEN'`, [campus.id,campus.institucion_id,publicationId,imageId])).rows[0],
    auditActors: async (campus: AccessCampus, entries: AuditEntry[]) => {
      if (!entries.length) return [];
      // Fechas originales con microsegundos, sin Date JS; solo registros ya acotados/autorizados.
      return (await client.query<AuditActorRow>(`WITH requested AS (
        SELECT * FROM jsonb_to_recordset($3::jsonb) AS a(id text,actor_id uuid,occurred_at timestamptz)
      ) SELECT a.id AS audit_id,(p.id IS NOT NULL AND p.created_at<=a.occurred_at) AS available,
        CASE WHEN p.campus_id=$1 THEN p.nombre_completo ELSE NULL END AS name,
        ARRAY(SELECT DISTINCT r.nombre FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
          WHERE p.id IS NOT NULL AND ur.perfil_usuario_id=a.actor_id AND ur.campus_id=$1
          AND ur.asignado_en<=a.occurred_at AND (ur.revocado_en IS NULL OR ur.revocado_en>a.occurred_at) ORDER BY r.nombre) AS roles,
        ARRAY(SELECT DISTINCT r.nombre FROM public.usuario_permiso up JOIN public.permiso r ON r.id=up.permiso_id
          WHERE p.id IS NOT NULL AND up.perfil_usuario_id=a.actor_id AND up.campus_id=$1
          AND up.otorgado_en<=a.occurred_at AND (up.revocado_en IS NULL OR up.revocado_en>a.occurred_at) ORDER BY r.nombre) AS permissions
      FROM requested a LEFT JOIN public.perfil_usuario p ON p.id=a.actor_id AND p.institucion_id=$2`,
      [campus.id,campus.institucion_id,JSON.stringify(entries.map(entry => ({ id: entry.id, actor_id: entry.actor_usuario_id, occurred_at: entry.created_at })))])).rows;
    },
    auditResponsibleProfile: async (campus: AccessCampus, userId: string) => (await client.query<AuditResponsibleProfile>(
      `SELECT ${registeredProfileColumns} ${registeredProfileScope}`, [campus.id,campus.institucion_id,userId])).rows[0] ?? null,
    accountProfile: async (campus: AccessCampus, userId: string) => (await client.query<AccessAccountProfile>(
      `SELECT ${registeredProfileColumns},
        to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "registeredAt"
       ${registeredProfileScope}`, [campus.id,campus.institucion_id,userId])).rows[0] ?? null,
    auditParticipantNames: async (campus: AccessCampus, ids: string[]) => (await client.query<{ id: string; name: string }>(
      `SELECT id::text AS id,nombre_completo AS name FROM public.perfil_usuario
       WHERE campus_id=$1 AND institucion_id=$2 AND id=ANY($3::uuid[])`, [campus.id,campus.institucion_id,ids])).rows,
    auditReferenceNames: async (campus: AccessCampus, references: AuditReferenceRequest[]) => {
      const requested = [...new Map(references.filter(row => !row.recordedName && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id))
        .map(row => [row.kind + ':' + row.id.toLowerCase(), { kind: row.kind, id: row.id }])).values()];
      if (!requested.length) return [];
      // IDs provenientes exclusivamente del detalle autorizado. No incluir correos, contactos ni perfiles completos.
      return (await client.query<AuditReferenceName>(`WITH requested AS (
        SELECT kind,id FROM jsonb_to_recordset($3::jsonb) AS r(kind text,id uuid)
      )
      SELECT 'user' AS kind,p.id::text AS id,p.nombre_completo AS name FROM public.perfil_usuario p
        JOIN requested r ON r.kind='user' AND r.id=p.id WHERE p.campus_id=$1 AND p.institucion_id=$2
      UNION ALL SELECT 'campus',c.id::text,c.nombre FROM public.campus c
        JOIN requested r ON r.kind='campus' AND r.id=c.id WHERE c.id=$1 AND c.institucion_id=$2
      UNION ALL SELECT 'institution',i.id::text,i.nombre FROM public.institucion i
        JOIN requested r ON r.kind='institution' AND r.id=i.id WHERE i.id=$2
      UNION ALL SELECT 'category',c.id::text,c.nombre FROM public.categoria_recurso_fisico c
        JOIN requested r ON r.kind='category' AND r.id=c.id
      UNION ALL SELECT 'role',c.id::text,c.nombre FROM public.rol c JOIN requested r ON r.kind='role' AND r.id=c.id
      UNION ALL SELECT 'permission',c.id::text,c.nombre FROM public.permiso c JOIN requested r ON r.kind='permission' AND r.id=c.id
      UNION ALL SELECT 'publication',p.id::text,p.titulo FROM public.publicacion_recurso p
        JOIN requested r ON r.kind='publication' AND r.id=p.id JOIN public.campus c ON c.id=p.campus_id
        WHERE p.campus_id=$1 AND c.institucion_id=$2
      UNION ALL SELECT 'career',c.id::text,c.nombre FROM public.carrera c
        JOIN requested r ON r.kind='career' AND r.id=c.id WHERE c.institucion_id=$2
        AND EXISTS(SELECT 1 FROM public.campus_carrera cc WHERE cc.campus_id=$1 AND cc.carrera_id=c.id)
      UNION ALL SELECT 'subject',s.id::text,s.nombre FROM public.asignatura s JOIN requested r ON r.kind='subject' AND r.id=s.id
        WHERE EXISTS(SELECT 1 FROM public.carrera_asignatura ca JOIN public.carrera c ON c.id=ca.carrera_id
          JOIN public.campus_carrera cc ON cc.carrera_id=c.id WHERE ca.asignatura_id=s.id AND cc.campus_id=$1 AND c.institucion_id=$2)`,
      [campus.id,campus.institucion_id,JSON.stringify(requested)])).rows;
    },
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
    users: async (campus: AccessCampus, limit: number, offset: number, search = '') => (await client.query<Omit<AccessProfile, 'updated_at'>>(
      `SELECT p.id,p.institucion_id,p.campus_id,p.nombre_completo,p.estado_cuenta,p.deleted_at ${accessUsersScope}
       ORDER BY p.nombre_completo,p.id LIMIT $4 OFFSET $5`, [campus.id,campus.institucion_id,search,limit,offset])).rows,
    userCount: async (campus: AccessCampus, search = '') => Number((await client.query<{ total: string }>(
      `SELECT count(*)::text AS total ${accessUsersScope}`, [campus.id,campus.institucion_id,search])).rows[0].total),
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
      // Los identificadores salen solo de estas constantes, nunca de datos recibidos en la solicitud.
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
