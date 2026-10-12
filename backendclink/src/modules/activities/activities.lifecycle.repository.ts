import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { getMongoDb } from '../../config/mongodb.js';
import { ApiError } from '../../services/apiError.js';
import type { ActivityDocument } from './activities.types.js';
import type { PoolClient } from 'pg';

export interface CreatorChange {
  id: string; user_id: string; campus_id: string; previous_version: string; changed_at: Date;
  reason: 'CAMPUS_CHANGED' | 'SUSPENDED' | 'DEACTIVATED';
}
export async function wasCreatorInvalidated(document: ActivityDocument, connection?: PoolClient): Promise<boolean> {
  const lookup = async (client: PoolClient) => Boolean((await client.query(
    `SELECT 1 FROM campuslink_private.activity_creator_changes WHERE user_id=$1
       AND (reason <> 'CAMPUS_CHANGED' OR campus_id=$2)
       AND (($3::timestamptz IS NOT NULL AND previous_version >= $3::timestamptz)
         OR $3::timestamptz IS NULL) LIMIT 1`,
    [document.createdByUserId,document.campusId,document.creatorVersion ?? null])).rows.length);
  return connection ? lookup(connection) : withPostgresTransaction(lookup);
}
export async function pendingCreatorChanges(): Promise<CreatorChange[]> {
  return withPostgresTransaction(async client => (await client.query<CreatorChange>(
    `SELECT id,user_id,campus_id,
      to_char(previous_version AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS previous_version,
      changed_at,reason FROM campuslink_private.activity_creator_changes
     WHERE processed_at IS NULL ORDER BY changed_at,id LIMIT 50`)).rows);
}
export async function acknowledgeCreatorChange(change: CreatorChange): Promise<void> {
  await withPostgresTransaction(async client => { await client.query(
    'UPDATE campuslink_private.activity_creator_changes SET processed_at=clock_timestamp() WHERE id=$1 AND processed_at IS NULL', [change.id]); });
}
/** A single-document atomic transition; partial batches are safe to replay after restart. */
export async function cancelCreatorCommunityActivities(change: CreatorChange): Promise<void> {
  const result = await getMongoDb().collection<ActivityDocument>('activities').updateMany({
    createdByUserId: change.user_id, type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE',
    ...(change.reason === 'CAMPUS_CHANGED' ? { campusId: change.campus_id } : {}),
    // Unversioned documents predate coordinated publication. Never trust their
    // local clock to decide whether an account invalidation should cancel them.
    $or: [{ creatorVersion: { $lte: change.previous_version } }, { creatorVersion: { $exists: false } }],
  }, { $set: { status: 'CANCELLED', updatedAt: new Date(),
    creatorCancellation: { eventId: change.id, reason: change.reason, changedAt: change.changed_at } },
    $inc: { editRevision: 1 } }, { writeConcern: { w: 'majority' } });
  if (!result.acknowledged) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Cancelación no confirmada.');
}
