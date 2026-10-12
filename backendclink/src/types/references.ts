/** Minimal relational projections; never copied into MongoDB documents. */
export interface CampusReference {
  id: string;
  institucion_id: string;
  activo: boolean;
}

export interface UserReference {
  id: string;
  campus_id: string;
  institucion_id: string;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'DESACTIVADA';
  deleted_at: string | null;
}

export interface ReferenceRepository {
  findCampus(id: string): Promise<CampusReference | null>;
  findUser(id: string): Promise<UserReference | null>;
}

export interface DocumentReferences {
  campusId: string;
  users?: readonly { id: string; field: string }[];
}
