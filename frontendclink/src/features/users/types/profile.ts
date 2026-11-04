/** Perfil y carreras de la sesión; `updatedAt` identifica la versión editable. */
export interface AcademicProfile {
  fullName: string; campusId: string; campusName: string;
  careers: { id: string; nombre: string }[]; updatedAt: string;
}
/** Catálogos vigentes que relacionan carreras con campus disponibles. */
export interface AcademicOptions {
  campuses: { id: string; name: string }[];
  careers: { id: string; name: string; campusIds: string[] }[];
}
