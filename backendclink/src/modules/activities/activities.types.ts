import type { ObjectId } from 'mongodb';

/** Current activities document supplied by the project owner, not the legacy bootstrap. */
export interface ActivityDocument {
  _id: ObjectId;
  campusId: string;
  createdByUserId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  visibility: string;
  startAt: Date;
  endAt: Date;
  bannerUrl?: string | null;
  category?: string | null;
  tags?: string[];
  location: {
    buildingKey: string;
    floorKey: string;
    poiKey?: string | null;
    customLabel?: string | null;
    coordinates?: { x: number; y: number; z: number } | null;
  };
  participantCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityQuery {
  buildingKey?: string;
  floorKey?: string;
  poiKey?: string;
}

export interface CreateCommunityActivityInput {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  location: { buildingKey: string; floorKey: string; poiKey?: string; customLabel?: string };
}

export type ActivityType = 'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT';

export interface ActivityDto {
  id: string;
  campusId: string;
  title: string;
  description: string;
  type: ActivityType;
  status: 'ACTIVE';
  startAt: string;
  endAt: string;
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

export interface ActivityParticipationDocument {
  _id?: ObjectId;
  activityId: ObjectId;
  userId: string;
  campusId: string;
  status: 'JOINED' | 'LEFT';
  joinedAt: Date;
  updatedAt: Date;
}

export interface ActivityDetailDto extends ActivityDto {
  organizer: { name: string } | null;
  participation: { status: 'JOINED' | 'LEFT' | 'NOT_JOINED'; canJoin: boolean };
  bannerUrl?: string;
  category?: string;
  tags?: string[];
}
