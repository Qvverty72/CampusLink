export interface AcademicProfile {
  fullName: string; campusId: string; campusName: string;
  careers: { id: string; nombre: string }[]; updatedAt: string;
}
export interface AcademicOptions {
  campuses: { id: string; name: string }[];
  careers: { id: string; name: string; campusIds: string[] }[];
}
