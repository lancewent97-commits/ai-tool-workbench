CREATE TABLE IF NOT EXISTS download_credentials (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('tool', 'ai-package', 'manual-package', 'historical', 'derived')),
  object_name text NOT NULL,
  package_version_id uuid REFERENCES package_versions(id) ON DELETE RESTRICT,
  tool_version_id uuid REFERENCES tool_versions(id) ON DELETE RESTRICT,
  source_task_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  locked_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback_state text NOT NULL DEFAULT 'none'
    CHECK (feedback_state IN ('none', 'submitted')),
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (package_version_id IS NOT NULL AND tool_version_id IS NULL)
    OR (package_version_id IS NULL AND tool_version_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS download_credentials_user_time_idx
  ON download_credentials (user_id, downloaded_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS download_credentials_package_idx
  ON download_credentials (package_version_id)
  WHERE package_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS download_credentials_tool_idx
  ON download_credentials (tool_version_id)
  WHERE tool_version_id IS NOT NULL;

INSERT INTO download_credentials (
  id, user_id, kind, object_name, package_version_id, source_task_id,
  locked_tools, downloaded_at
)
SELECT
  event.id,
  event.user_id,
  CASE package.source
    WHEN 'manual' THEN 'manual-package'
    ELSE 'ai-package'
  END,
  package.name,
  package.id,
  package.conversation_id,
  package.locked_tools,
  event.downloaded_at
FROM package_download_events event
JOIN package_versions package ON package.id = event.package_version_id
ON CONFLICT (id) DO NOTHING;
