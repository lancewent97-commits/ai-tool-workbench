CREATE TABLE IF NOT EXISTS package_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id text NOT NULL,
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('ai', 'manual')),
  draft_revision integer NOT NULL
    CONSTRAINT package_versions_draft_revision_positive CHECK (draft_revision > 0),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'failed')),
  name text NOT NULL,
  goal text,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  planned_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_snapshot jsonb NOT NULL,
  start_prompt text NOT NULL DEFAULT '',
  archive_path text,
  archive_bytes bigint,
  archive_sha256 text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  UNIQUE (user_id, draft_id, version_number),
  FOREIGN KEY (user_id, draft_id)
    REFERENCES package_drafts(user_id, id)
    ON DELETE RESTRICT,
  CHECK (archive_bytes IS NULL OR archive_bytes >= 0),
  CHECK (archive_sha256 IS NULL OR archive_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (
    status <> 'ready'
    OR (
      archive_path IS NOT NULL
      AND archive_bytes IS NOT NULL
      AND archive_sha256 IS NOT NULL
      AND start_prompt <> ''
      AND ready_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS package_versions_user_created_idx
  ON package_versions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS package_versions_conversation_idx
  ON package_versions (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS package_download_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_version_id uuid NOT NULL REFERENCES package_versions(id) ON DELETE CASCADE,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS package_download_events_user_time_idx
  ON package_download_events (user_id, downloaded_at DESC);
