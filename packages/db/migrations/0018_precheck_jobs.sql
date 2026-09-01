CREATE TABLE precheck_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL UNIQUE REFERENCES upload_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tool', 'return')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX precheck_jobs_queue_idx
  ON precheck_jobs (created_at)
  WHERE status = 'queued';
