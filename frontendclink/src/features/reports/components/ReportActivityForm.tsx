import { useAuth } from '@/features/auth/AuthProvider';
import { ReportContentForm } from './ReportContentForm';

/** Keeps the existing activity-detail integration while sharing the common form. */
export function ReportActivityForm({ activityId, title, onBack }: {
  activityId: string; title: string; onBack: () => void;
}) {
  const { identity } = useAuth();
  if (!identity) return null;
  return <ReportContentForm target={{ targetType: 'ACTIVIDAD', targetId: activityId, campusId: identity.campusId }}
    title={title} onBack={onBack} />;
}
