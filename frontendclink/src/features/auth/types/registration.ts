/** Opción pública que vincula dominio institucional con campus activo. */
export interface RegistrationOption {
  dominio: string;
  institucion_id: string;
  institucion_nombre: string;
  campus_id: string;
  campus_nombre: string;
}
/** Datos que el formulario envía al inicio del registro; identidad final la resuelve Auth. */
export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  campusId: string;
}
