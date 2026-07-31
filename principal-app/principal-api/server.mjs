#!/usr/bin/env node
/* Entrypoint. See README.md for setup, env vars, and curl examples. */
import express from 'express';
import cors from 'cors';
import { agentIngestRouter } from './routes/agentIngest.mjs';
import { webhooksOutRouter } from './routes/webhooksOut.mjs';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Agent-ingest routes are deliberately NOT behind CORS — they're
// server-to-server (agent process -> this server), and a browser
// should never be able to reach them at all, shared secret or not.
app.use('/v1/agent', agentIngestRouter);

// Webhook-out routes ARE behind CORS, scoped to the deployed dashboard's
// origin(s) only.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use('/v1/webhooks', cors({ origin: allowedOrigins }), webhooksOutRouter);

app.use((err, req, res, next) => {
  if (res.headersSent) { next(err); return; }
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'Internal error.' });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`principal-api listening on :${port}`));
