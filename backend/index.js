// DLOVS Backend API
// Node.js/Express REST API on top of PostgreSQL, per the System Architecture
// Diagram (Figure 1). In production this runs on Render.com's free Web
// Service tier, called over HTTPS by both the React web app (Netlify) and
// the React Native mobile app (Expo).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const parcelRoutes = require('./routes/parcelRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ service: 'DLOVS API', status: 'running' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/audit-logs', auditRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`DLOVS API listening on port ${PORT}`);
});
