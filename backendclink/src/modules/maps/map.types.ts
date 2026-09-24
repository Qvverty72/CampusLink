import type { ObjectId } from 'mongodb';

export type CampusMapStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface CampusMapDocument {
  _id?: ObjectId;
  campusId: string;
  version: number;
  status: CampusMapStatus;
  buildings: unknown[];
  createdAt: Date;
  updatedAt: Date;
}
