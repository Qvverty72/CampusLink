import { useAuth } from '@/features/auth/AuthProvider';
import { useContentReport } from './useContentReport';

/** Compatibility adapter for activity consumers; request/session state has one implementation. */
export function useActivityReport(activityId: string) {
  const { identity } = useAuth();
  const { receipt, ...state } = useContentReport({ targetType: 'ACTIVIDAD', targetId: activityId, campusId: identity?.campusId ?? '' });
  return { ...state, receipt: receipt ? { id: receipt.id, activityId: receipt.targetId, campusId: receipt.campusId,
    status: receipt.status, reportedAt: receipt.reportedAt } : null };
}
