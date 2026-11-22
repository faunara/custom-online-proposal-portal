const express = require('express');
const { Pool } = require('pg');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const statuses = ['Draft', 'Sent', 'In review', 'Approved'];
function adminProposal(row) {
  return { id: row.id, title: row.title, client_name: row.client_name, client_email: row.client_email,
    overview: row.overview, amount: Number(row.amount), currency: row.currency, timeline: row.timeline,
    deliverables: row.deliverables || [], status: row.status, share_token: row.share_token,
    created_at: row.created_at, updated_at: row.updated_at };
}
function clientProposal(row) {
  return { title: row.title, client_name: row.client_name, overview: row.overview,
    amount: Number(row.amount), currency: row.currency, timeline: row.timeline,
    deliverables: row.deliverables || [], status: row.status, updated_at: row.updated_at };
}
function validateProposal(b) {
  if (!b || typeof b.title !== 'string' || !b.title.trim()) return 'A proposal title is required.';
  if (typeof b.client_name !== 'string' || !b.client_name.trim()) return 'A client name is required.';
  if (b.client_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.client_email)) return 'Enter a valid client email address.';
  const amount = Number(b.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999) return 'Enter a valid non-negative amount.';
  if (b.currency && !/^[A-Z]{3}$/.test(b.currency)) return 'Currency must be a three-letter code.';
  if (b.deliverables !== undefined && (!Array.isArray(b.deliverables) || b.deliverables.length > 100)) return 'Deliverables must be a list of up to 100 items.';
  return null;
}
function proposalValues(b) {
  return [b.title.trim(), b.client_name.trim(), (b.client_email || '').trim() || null,
    String(b.overview || '').slice(0, 20000), Number(b.amount ?? 0), b.currency || 'USD',
    String(b.timeline || '').slice(0, 300), (b.deliverables || []).map(x => String(x).slice(0, 500))];
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable', message: 'Configure DATABASE_URL and run schema.sql in Supabase.' }); }
});

app.get('/api/proposals', async (_req, res) => {
  try { const q = await pool.query('SELECT * FROM proposals ORDER BY updated_at DESC'); res.json(q.rows.map(adminProposal)); }
  catch (e) { console.error('List proposals:', e); res.status(503).json({ error: 'Could not load proposals. Check the Supabase connection and database schema.' }); }
});

app.post('/api/proposals', async (req, res) => {
  const b = req.body || {}; const invalid = validateProposal(b);
  if (invalid) return res.status(400).json({ error: invalid });
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    const q = await pool.query(`INSERT INTO proposals
      (title, client_name, client_email, overview, amount, currency, timeline, deliverables, status, share_token)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [...proposalValues(b), statuses.includes(b.status) ? b.status : 'Sent', token]);
    res.status(201).json(adminProposal(q.rows[0]));
  } catch (e) { console.error('Create proposal:', e); res.status(503).json({ error: 'Could not save proposal. Check that the Supabase schema has been installed.' }); }
});

app.patch('/api/proposals/:id', async (req, res) => {
  const b = req.body || {}; const invalid = validateProposal(b);
  if (invalid) return res.status(400).json({ error: invalid });
  if (b.status !== undefined && !statuses.includes(b.status)) return res.status(400).json({ error: 'Invalid proposal status.' });
  try {
    const q = await pool.query(`UPDATE proposals SET title=$1, client_name=$2, client_email=$3, overview=$4,
      amount=$5, currency=$6, timeline=$7, deliverables=$8, status=COALESCE($9,status), updated_at=NOW()
      WHERE id=$10 RETURNING *`, [...proposalValues(b), b.status || null, req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Proposal not found.' });
    res.json(adminProposal(q.rows[0]));
  } catch (e) { console.error('Update proposal:', e); res.status(503).json({ error: 'Could not update proposal.' }); }
});

app.delete('/api/proposals/:id', async (req, res) => {
  try {
    const q = await pool.query('DELETE FROM proposals WHERE id=$1 RETURNING id', [req.params.id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Proposal not found.' });
    res.json({ ok: true, id: q.rows[0].id });
  } catch (e) { console.error('Delete proposal:', e); res.status(503).json({ error: 'Could not delete proposal.' }); }
});

app.get('/api/public/:token', async (req, res) => {
  try {
    const q = await pool.query('SELECT * FROM proposals WHERE share_token=$1', [req.params.token]);
    if (!q.rowCount) return res.status(404).json({ error: 'Proposal link not found.' });
    res.json(clientProposal(q.rows[0]));
  } catch (e) { console.error('Load shared proposal:', e); res.status(503).json({ error: 'Could not load proposal.' }); }
});

app.post('/api/public/:token/decision', async (req, res) => {
  const action = req.body && req.body.action;
  const comment = String((req.body && req.body.comment) || '').slice(0, 5000);
  if (!['approved', 'changes_requested'].includes(action)) return res.status(400).json({ error: 'Choose approve or request changes.' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const q = await client.query('SELECT id,status FROM proposals WHERE share_token=$1 FOR UPDATE', [req.params.token]);
    if (!q.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Proposal link not found.' }); }
    if (q.rows[0].status === 'Approved') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This proposal has already been approved.' }); }
    const nextStatus = action === 'approved' ? 'Approved' : 'In review';
    await client.query('UPDATE proposals SET status=$1, updated_at=NOW() WHERE id=$2', [nextStatus, q.rows[0].id]);
    await client.query('INSERT INTO proposal_activity (proposal_id, action, comment) VALUES ($1,$2,$3)', [q.rows[0].id, action, comment]);
    await client.query('COMMIT');
    res.json({ ok: true, status: nextStatus });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Save client decision:', e);
    res.status(503).json({ error: 'Could not save your response. Please try again.' });
  } finally { if (client) client.release(); }
});

app.get('/api/proposals/:id/activity', async (req, res) => {
  try {
    const q = await pool.query('SELECT action, comment, created_at FROM proposal_activity WHERE proposal_id=$1 ORDER BY created_at DESC', [req.params.id]);
    res.json(q.rows);
  } catch (e) { console.error('Load proposal activity:', e); res.status(503).json({ error: 'Could not load proposal activity.' }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
if (require.main === module) app.listen(port, () => console.log('Northstar portal listening on port ' + port));
module.exports = app;
