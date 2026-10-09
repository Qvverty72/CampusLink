import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import { createServerSupabaseClient } from '../../database/supabase/client.js';
import type { AcademicOption, AcademicProfileRow, AcademicProfileTransaction, LockedAcademicProfile } from './users.types.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { AuthAssignment } from '../auth/auth.types.js';

export function findAcademicProfile(userId: string) {
  return createServerSupabaseClient().from('perfil_usuario')
    .select('id,institucion_id,campus_id,nombre_completo,updated_at,estado_cuenta,deleted_at,campus:campus!perfil_usuario_campus_id_fkey(id,nombre),usuario_carrera(carrera:carrera_id(id,nombre))')
    .eq('id', userId).maybeSingle<AcademicProfileRow>();
}

export async function findAcademicOptions(institutionId: string) {
  const client = createServerSupabaseClient();
  const [campuses, careers, offerings] = await Promise.all([
    client.from('campus').select('id,nombre,institucion_id,activo').eq('institucion_id', institutionId).eq('activo', true).order('nombre').returns<AcademicOption[]>(),
    client.from('carrera').select('id,nombre,institucion_id,activo').eq('institucion_id', institutionId).eq('activo', true).order('nombre').returns<AcademicOption[]>(),
    client.from('campus_carrera').select('campus_id,carrera_id,campus!inner(institucion_id)').eq('campus.institucion_id', institutionId),
  ]);
  return { campuses, careers, offerings };
}

export function withAcademicProfileTransaction<T>(operation: (repository: AcademicProfileTransaction) => Promise<T>): Promise<T> {
  return withPostgresTransaction(async client => operation({
    lockProfile: async (userId, updatedAt) => {
      const result = await client.query<LockedAcademicProfile>(
        `SELECT id, institucion_id, campus_id, estado_cuenta, deleted_at, verificado_en,
          updated_at = $2::timestamptz AS version_matches
         FROM public.perfil_usuario WHERE id = $1 FOR UPDATE`, [userId, updatedAt]);
      return result.rows[0] ?? null;
    },
    lockRoles: async userId => (await client.query<AuthAssignment>(
      `SELECT r.id, r.nombre AS name, ur.campus_id AS "campusId" FROM public.usuario_rol ur
       JOIN public.rol r ON r.id=ur.rol_id WHERE ur.perfil_usuario_id=$1 AND ur.revocado_en IS NULL
       ORDER BY ur.id FOR SHARE OF ur,r`, [userId])).rows,
    lockCampus: async campusId => {
      const result = await client.query<AcademicOption>(
        'SELECT id, nombre, institucion_id, activo FROM public.campus WHERE id = $1 FOR SHARE', [campusId]);
      return result.rows[0] ?? null;
    },
    lockCareers: async (campusId, careerIds) => {
      const careers = await client.query<AcademicOption>(
        'SELECT id, nombre, institucion_id, activo FROM public.carrera WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE', [careerIds]);
      const offerings = await client.query<{ carrera_id: string }>(
        'SELECT carrera_id FROM public.campus_carrera WHERE campus_id = $1 AND carrera_id = ANY($2::uuid[]) ORDER BY carrera_id FOR SHARE', [campusId, careerIds]);
      return { careers: careers.rows, offeredCareerIds: offerings.rows.map(row => row.carrera_id) };
    },
    save: async (userId, input) => {
      const result = await client.query<{ updated_at: string }>(
        `UPDATE public.perfil_usuario SET nombre_completo = $2, campus_id = $3,
           updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
         WHERE id = $1
         RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`,
        [userId, input.fullName, input.campusId]);
      await client.query('DELETE FROM public.usuario_carrera WHERE perfil_usuario_id = $1 AND NOT (carrera_id = ANY($2::uuid[]))', [userId, input.careerIds]);
      // Keep anio_ingreso on retained associations; only insert newly selected careers.
      await client.query('INSERT INTO public.usuario_carrera(perfil_usuario_id, carrera_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [userId, input.careerIds]);
      if (!result.rows[0]) throw new Error('Profile write failed');
      return result.rows[0].updated_at;
    },
  }));
}

export function probeUsersDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"perfil_usuario"}]),
  });
}
