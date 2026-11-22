const express = require('express');
const { Pool } = require('pg');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function publicProposal(row) { return { id: row.id, title: row.title, client_name: row.client_name, client_email: row.client_email, overview: row.overview, amount: Number(row.amount), currency: row.currency, timeline: row.timeline, deliverables: row.deliverables, status: row.status, share_token: row.share_token, created_at: row.created_at, updated_at: row.updated_at }; }

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.get('/api/proposals', async (_req, res) => { try { const q = await pool.query('SELECT * FROM proposals ORDER BY updated_at DESC'); res.json(q.rows.map(publicProposal)); } catch { res.status(500).json({ error: 'Could not load proposals.' }); } });
app.post('/api/proposals', async (req, res) => {
  const b = req.body || {}; if (!b.title || !b.client_name) return res.status(400).json({ error: 'Title and client name are required.' });
  const token = crypto.randomBytes(24).toString('base64url');
  try {
    const q = await pool.query('INSERT INTO proposals (title, client_name, client_email, overview, amount, currency, timeline, deliverables, status, share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [b.title, b.client_name, b.client_email || null, b.overview || '', Number(b.amount || 0), b.currency || 'USD', b.timeline || '', Array.isArray(b.deliverables) ? b.deliverables : [], 'Sent', token]);
    res.status(201).json(publicProposal(q.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save proposal.' }); }
});
app.patch('/api/proposals/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const q = await pool.query('UPDATE proposals SET title=$1, client_name=$2, client_email=$3, overview=$4, amount=$5, currency=$6, timeline=$7, deliverables=$8, updated_at=NOW() WHERE id=$9 RETURNING *', [b.title, b.client_name, b.client_email || null, b.overview || '', Number(b.amount || 0), b.currency || 'USD', b.timeline || '', Array.isArray(b.deliverables) ? b.deliverables : [], req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Proposal not found.' });
    res.json(publicProposal(q.rows[0]));
  } catch { res.status(500).json({ error: 'Could not update proposal.' }); }
});
app.get('/api/public/:token', async (req, res) => {
  try { const q = await pool.query('SELECT * FROM proposals WHERE share_token=$1', [req.params.token]); if (!q.rowCount) return res.status(404).json({ error: 'Proposal link not found.' }); res.json(publicProposal(q.rows[0])); }
  catch { res.status(500).json({ error: 'Could not load proposal.' }); }
});
app.post('/api/public/:token/decision', async (req, res) => {
  const action = req.body && req.body.action; const comment = String((req.body && req.body.comment) || '').slice(0, 5000);
  if (!['approved', 'changes_requested'].includes(action)) return res.status(400).json({ error: 'Invalid decision.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('UPDATE proposals SET status=$1, updated_at=NOW() WHERE share_token=$2 RETURNING id', [action === 'approved' ? 'Approved' : 'In review', req.params.token]);
    if (!q.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Proposal link not found.' }); }
    await client.query('INSERT INTO proposal_activity (proposal_id, action, comment) VALUES ($1,$2,$3)', [q.rows[0].id, action, comment]);
    await client.query('COMMIT'); res.json({ ok: true });
  } catch { await client.query('ROLLBACK'); res.status(500).json({ error: 'Could not save your response.' }); }
  finally { client.release(); }
});
app.get('/api/proposals/:id/activity', async (req, res) => { try { const q = await pool.query('SELECT action, comment, created_at FROM proposal_activity WHERE proposal_id=$1 ORDER BY created_at DESC', [req.params.id]); res.json(q.rows); } catch { res.status(500).json({ error: 'Could not load activity.' }); } });
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
if (require.main === module) app.listen(port, () => console.log('Northstar portal listening on port ' + port));

module.exports = app;