import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireCampusCapability, type CampusCapability } from '../auth/auth.authorization.js';
import { ApiError } from '../../services/apiError.js';
import { createReferenceValidator, dependencyOperation } from '../../services/references.js';
import type { ActivityDocument } from './activities.types.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

const references = createReferenceValidator();
const actorConnection = new AsyncLocalStorage<PoolClient>();
/** Infrastructure boundary, injectable by replacing methods in isolated unit fixtures. */
export const activityIntegrity = {
  async isVisible(document: ActivityDocument): Promise<boolean> {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(document.createdByUserId)) return false;
    if (!await references.areReferencesCurrent({ campusId: document.campusId })) return false;
    if (document.type === 'OFFICIAL_EVENT') {
      // Historical creator references need existence/institution, not current account/campus.
      const { findUserReference, findCampusReference } = await import('../../database/supabase/references.repository.js');
      const creator = await dependencyOperation(() => findUserReference(document.createdByUserId));
      const campus = await dependencyOperation(() => findCampusReference(document.campusId));
      return !!creator && creator.id === document.createdByUserId && creator.institucion_id === campus?.institucion_id;
    }
    const connection = actorConnection.getStore();
    if (connection) {
      // A participant's write also protects the community creator from moving or
      // being suspended between the availability check and the Mongo commit.
      const creator = await dependencyOperation(async () => (await connection.query<{
        campus_id: string; estado_cuenta: string; deleted_at: unknown;
      }>('SELECT campus_id,estado_cuenta,deleted_at FROM public.perfil_usuario WHERE id=$1 FOR SHARE', [document.createdByUserId])).rows[0]);
      if (!creator || creator.campus_id !== document.campusId || creator.estado_cuenta !== 'ACTIVA' || creator.deleted_at) return false;
    }
    if (!await references.areReferencesCurrent({ campusId: document.campusId,
      users: [{ id: document.createdByUserId, field: 'createdByUserId' }] })) return false;
    // Retained intents also cover move-away-and-back before the Mongo worker catches up.
    return !await dependencyOperation(async () => (await import('./activities.lifecycle.repository.js')).wasCreatorInvalidated(document, actorConnection.getStore()));
  },
  async withActor<T>(auth: VerifiedAuthConnection, capability: CampusCapability,
    operation: (current: VerifiedAuthConnection, version: string) => Promise<T>): Promise<T> {
    requireCampusCapability(auth, auth.campusId, capability);
    const { withPostgresTransaction } = await import('../../database/supabase/postgres.js');
    return dependencyOperation(() => withPostgresTransaction(async client => {
      const profile = (await client.query<VerifiedAuthConnection['profile'] & { updated_at: string }>(
        `SELECT id,institucion_id,campus_id,nombre_completo,foto_path,verificado_en,estado_cuenta,deleted_at,
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM public.perfil_usuario WHERE id=$1 FOR SHARE`, [auth.userId])).rows[0];
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
        throw new ApiError(403, 'FORBIDDEN', 'El contexto de la cuenta cambió.');
      }
      const campus = (await client.query<{ activo: boolean; institucion_id: string }>(
        'SELECT activo,institucion_id FROM public.campus WHERE id=$1 FOR SHARE', [auth.campusId])).rows[0];
      if (!campus?.activo || campus.institucion_id !== profile.institucion_id) throw new ApiError(403, 'FORBIDDEN', 'Campus no disponible.');
      const roles = (await client.query<VerifiedAuthConnection['roles'][number]>(
        `SELECT r.id,r.nombre AS name,ur.campus_id AS "campusId" FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
         WHERE ur.perfil_usuario_id=$1 AND ur.revocado_en IS NULL ORDER BY ur.id FOR SHARE OF ur,r`, [auth.userId])).rows;
      const permissions = (await client.query<VerifiedAuthConnection['permissions'][number]>(
        `SELECT p.id,p.nombre AS name,up.campus_id AS "campusId" FROM public.usuario_permiso up JOIN public.permiso p ON p.id=up.permiso_id
         WHERE up.perfil_usuario_id=$1 AND up.revocado_en IS NULL ORDER BY up.id FOR SHARE OF up,p`, [auth.userId])).rows;
      const current = { ...auth, profile, roles, permissions };
      requireCampusCapability(current, current.campusId, capability);
      return actorConnection.run(client, () => operation(current, profile.updated_at));
    }));
  },
};
