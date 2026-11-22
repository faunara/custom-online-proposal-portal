CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  overview TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  timeline TEXT NOT NULL DEFAULT '',
  deliverables TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','In review','Approved')),
  share_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proposal_activity (
  id BIGSERIAL PRIMARY KEY,
  proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approved','changes_requested')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS proposals_updated_at_idx ON proposals(updated_at DESC);
CREATE INDEX IF NOT EXISTS proposal_activity_proposal_id_idx ON proposal_activity(proposal_id, created_at DESC);