const express = require('express');
const { Pool } = require('pg');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const secret = process.env.SESSION_SECRET;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!process.env.DATABASE_URL || !secret || !adminPassword) { console.error('Set DATABASE_URL, SESSION_SECRET, and ADMIN_PASSWORD.'); process.exit(1); }
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sign(value) { return crypto.createHmac('sha256', secret).update(value).digest('hex'); }
function makeSession() { const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 7 * 86400000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url'); return payload + '.' + sign(payload); }
function isAdmin(req, res, next) {
  const raw = req.headers.cookie || ''; const match = raw.match(/northstar_session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Please sign in.' });
  const parts = match[1].split('.');
  if (parts.length !== 2 || parts[1].length !== 64 || !crypto.timingSafeEqual(Buffer.from(sign(parts[0])), Buffer.from(parts[1]))) return res.status(401).json({ error: 'Session expired.' });
  try { const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); if (data.exp < Date.now()) throw new Error('expired'); } catch { return res.status(401).json({ error: 'Session expired.' }); }
  next();
}
function publicProposal(row) { return { id: row.id, title: row.title, client_name: row.client_name, client_email: row.client_email, overview: row.overview, amount: Number(row.amount), currency: row.currency, timeline: row.timeline, deliverables: row.deliverables, status: row.status, share_token: row.share_token, created_at: row.created_at, updated_at: row.updated_at }; }

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.post('/api/admin/login', (req, res) => {
  if (!req.body || req.body.password !== adminPassword) return res.status(401).json({ error: 'Incorrect password.' });
  res.setHeader('Set-Cookie', 'northstar_session=' + makeSession() + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
  res.json({ ok: true });
});
app.post('/api/admin/logout', (_req, res) => { res.setHeader('Set-Cookie', 'northstar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/proposals', isAdmin, async (_req, res) => { try { const q = await pool.query('SELECT * FROM proposals ORDER BY updated_at DESC'); res.json(q.rows.map(publicProposal)); } catch { res.status(500).json({ error: 'Could not load proposals.' }); } });
app.post('/api/proposals', isAdmin, async (req, res) => {
  const b = req.body || {}; if (!b.title || !b.client_name) return res.status(400).json({ error: 'Title and client name are required.' });
  const token = crypto.randomBytes(24).toString('base64url');
  try {
    const q = await pool.query('INSERT INTO proposals (title, client_name, client_email, overview, amount, currency, timeline, deliverables, status, share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [b.title, b.client_name, b.client_email || null, b.overview || '', Number(b.amount || 0), b.currency || 'USD', b.timeline || '', Array.isArray(b.deliverables) ? b.deliverables : [], 'Sent', token]);
    res.status(201).json(publicProposal(q.rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save proposal.' }); }
});
app.patch('/api/proposals/:id', isAdmin, async (req, res) => {
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
app.get('/api/proposals/:id/activity', isAdmin, async (req, res) => { try { const q = await pool.query('SELECT action, comment, created_at FROM proposal_activity WHERE proposal_id=$1 ORDER BY created_at DESC', [req.params.id]); res.json(q.rows); } catch { res.status(500).json({ error: 'Could not load activity.' }); } });
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, () => console.log('Northstar portal listening on port ' + port));