import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes';
import parcelRoutes from './routes/parcelRoutes';
import disputeRoutes from './routes/disputeRoutes';
import auditRoutes from './routes/auditRoutes';
import adminRoutes from './routes/adminRoutes';
import documentRoutes from './routes/documentRoutes';
import requestRoutes from './routes/requestRoutes';
import transferRoutes from './routes/transferRoutes';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/', (_req: Request, res: Response) => res.json({ service: 'DLOVS API', status: 'running' }));
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/pending-transfers', transferRoutes);
app.use('/api', requestRoutes);

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

app.use((err: { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed') { res.status(400).json({ error: 'Request body is not valid JSON' }); return; }
  if (err.type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large' }); return; }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
