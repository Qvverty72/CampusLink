import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { apiRouter } from './routes/index.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/v1', apiRouter);

