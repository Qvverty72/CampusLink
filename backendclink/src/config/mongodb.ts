// Fachada de configuración conservada para que los módulos de dominio no dependan
// del nombre histórico `getMongoDB`. Ambos nombres apuntan al mismo cliente compartido.
export { getMongoDB as getMongoDb } from '../database/mongodb/client.js';
