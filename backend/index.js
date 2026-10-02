// DLOVS Backend API
// Node.js/Express REST API on top of PostgreSQL, per the System Architecture
// Diagram (Figure 1). In production this runs on Render.com's free Web
// Service tier, called over HTTPS by both the React web app (Netlify) and
// the React Native mobile app (Expo).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const parcelRoutes = require('./routes/parcelRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const auditRoutes = require('./routes/auditRoutes');
const adminRoutes = require('./routes/adminRoutes');
const documentRoutes = require('./routes/documentRoutes');
const requestRoutes = require('./routes/requestRoutes');

const app = express();
// Render (and most hosts) sit behind one proxy; needed so login limits apply
// per visitor, not to everyone at once
app.set('trust proxy', 1);
app.use(helmet());
// CORS_ORIGINS: comma-separated web app addresses allowed to call the API.
// Unset (development) allows any origin. Mobile apps don't send an Origin.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ service: 'DLOVS API', status: 'running' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', requestRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Malformed JSON and other request errors come back as JSON, not an HTML page
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`DLOVS API listening on port ${PORT}`);
});
