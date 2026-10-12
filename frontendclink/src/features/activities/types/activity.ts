import { APP_COLORS } from '../../../types/colors';

/** Public read contract. Spatial keys reference map data, not GLB node names. */
export interface Activity {
  id: string;
  campusId: string;
  title: string;
  description: string;
  type: 'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT';
  status: 'ACTIVE';
  startAt: string;
  endAt: string;
  series?: { id: string; index: number; total: number };
  location: {
    buildingKey: string;
    buildingName: string;
    floorKey: string;
    floorName: string;
    poiKey?: string;
    poiName?: string;
    customLabel?: string;
  };
}

export interface ActivityLocationQuery { buildingKey?: string; floorKey?: string; poiKey?: string }
export interface ActivityDetail extends Activity {
  participantCount?: number;
  editing?: { revision: number; canEditUpcoming: boolean };
  organizer: { name: string } | null;
  participation: { status: 'JOINED' | 'LEFT' | 'NOT_JOINED'; canJoin: boolean; canLeave: boolean };
  bannerUrl?: string;
  category?: string;
  tags?: string[];
}
export const ACTIVITY_COLORS = {
  OFFICIAL_EVENT: APP_COLORS.SECONDARY,
  COMMUNITY_ACTIVITY: APP_COLORS.ACCENT,
} as const;
export interface ActivityParticipation {
  activityId: string;
  campusId: string;
  status: 'JOINED' | 'LEFT' | 'NOT_JOINED';
  canLeave: boolean;
  joinedAt?: string;
  updatedAt?: string;
}
export const ACTIVITY_LABELS = { OFFICIAL_EVENT: 'Evento oficial', COMMUNITY_ACTIVITY: 'Actividad comunitaria' };

export const ACTIVITY_PARTICIPANTS_PAGE_SIZE = 7;

export interface ActivityParticipantsPage {
  activityId: string; campusId: string; page: number; pageSize: number; total: number;
  participants: { key: string; name: string | null; isCurrentUser: boolean }[];
}
export interface ActivityDeletionResult {
  activityId: string; campusId: string; revision: number; deletedAt: string;
}

export function filterLocationActivities(activities: Activity[], query: ActivityLocationQuery, now = Date.now()): Activity[] {
  return activities.filter(activity => Date.parse(activity.endAt) > now
    && (!query.buildingKey || activity.location.buildingKey === query.buildingKey)
    && (!query.floorKey || activity.location.floorKey === query.floorKey)
    && (!query.poiKey || activity.location.poiKey === query.poiKey));
}
