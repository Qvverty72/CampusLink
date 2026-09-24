import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { apiRouter } from './routes/index.js';

// Este archivo compone la aplicación HTTP, pero no abre el puerto. Separar `app`
// de `server.ts` permite reutilizar Express en pruebas sin iniciar el proceso completo.
export const app = express();

// Los middlewares transversales se ejecutan antes de cualquier endpoint versionado:
// Helmet agrega cabeceras defensivas, CORS queda habilitado con sus defaults y `express.json`
// deja el body disponible para los futuros controllers que reciban JSON.
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/v1', apiRouter);

