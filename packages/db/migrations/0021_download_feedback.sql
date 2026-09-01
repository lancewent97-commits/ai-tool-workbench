ALTER TABLE download_credentials
  ADD COLUMN IF NOT EXISTS feedback_result text
    CHECK (feedback_result IS NULL OR feedback_result IN ('complete', 'partial', 'failed')),
  ADD COLUMN IF NOT EXISTS feedback_rating smallint
    CHECK (feedback_rating IS NULL OR (feedback_rating >= 1 AND feedback_rating <= 5)),
  ADD COLUMN IF NOT EXISTS feedback_comment text,
  ADD COLUMN IF NOT EXISTS feedback_submitted_at timestamptz;

CREATE TABLE IF NOT EXISTS tool_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  download_id uuid NOT NULL UNIQUE REFERENCES download_credentials(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  tool_version_id uuid NOT NULL REFERENCES tool_versions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_reviews_tool_idx
  ON tool_reviews (tool_id, created_at DESC);
