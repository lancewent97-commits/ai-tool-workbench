CREATE TABLE IF NOT EXISTS return_submissions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_download_id uuid NOT NULL REFERENCES download_credentials(id) ON DELETE RESTRICT,
  name text NOT NULL,
  state text NOT NULL
    CHECK (state IN (
      'precheck-failed',
      'precheck-passed',
      'reviewing',
      'review-rejected',
      'published',
      'offline'
    )),
  current_version_number integer NOT NULL CHECK (current_version_number > 0),
  review_reason text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  adopted_count integer NOT NULL DEFAULT 0 CHECK (adopted_count >= 0),
  listed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS return_submissions_user_time_idx
  ON return_submissions (user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS return_submissions_review_queue_idx
  ON return_submissions (state, updated_at)
  WHERE state = 'reviewing';

CREATE TABLE IF NOT EXISTS return_versions (
  id uuid PRIMARY KEY,
  return_id uuid NOT NULL REFERENCES return_submissions(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  file_name text NOT NULL,
  archive_path text,
  archive_bytes bigint NOT NULL CHECK (archive_bytes >= 0),
  archive_sha256 text NOT NULL CHECK (archive_sha256 ~ '^[a-f0-9]{64}$'),
  precheck_status text NOT NULL CHECK (precheck_status IN ('failed', 'passed')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  fix_prompt text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (return_id, version_number)
);

CREATE INDEX IF NOT EXISTS return_versions_return_time_idx
  ON return_versions (return_id, version_number DESC);
