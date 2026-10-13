export interface RegistrationOption {
  dominio: string;
  institucion_id: string;
  institucion_nombre: string;
  campus_id: string;
  campus_nombre: string;
}
export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  campusId: string;
}
