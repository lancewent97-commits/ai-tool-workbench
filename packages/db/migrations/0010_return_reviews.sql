ALTER TABLE return_versions
  ADD COLUMN IF NOT EXISTS asset_candidates jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS return_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES return_submissions(id) ON DELETE CASCADE,
  return_version_id uuid NOT NULL REFERENCES return_versions(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text NOT NULL DEFAULT '',
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_version_id)
);

CREATE INDEX IF NOT EXISTS return_review_decisions_return_idx
  ON return_review_decisions (return_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS return_publish_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES return_submissions(id) ON DELETE RESTRICT,
  return_version_id uuid NOT NULL REFERENCES return_versions(id) ON DELETE RESTRICT,
  candidate_id text NOT NULL,
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE RESTRICT,
  tool_version_id uuid NOT NULL REFERENCES tool_versions(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_version_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS return_publish_records_return_idx
  ON return_publish_records (return_id, published_at DESC);
