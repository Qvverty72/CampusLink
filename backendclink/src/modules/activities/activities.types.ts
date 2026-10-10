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
