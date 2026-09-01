ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'maintainer-upload'
    CHECK (origin_type IN (
      'maintainer-upload',
      'return-composite',
      'return-derived',
      'return-new',
      'seed'
    )),
  ADD COLUMN IF NOT EXISTS source_return_id uuid REFERENCES return_submissions(id),
  ADD COLUMN IF NOT EXISTS source_candidate_id text,
  ADD COLUMN IF NOT EXISTS offline_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_reason text;

ALTER TABLE tool_versions
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'maintainer-upload'
    CHECK (source_type IN ('maintainer-upload', 'return')),
  ADD COLUMN IF NOT EXISTS source_return_version_id uuid REFERENCES return_versions(id),
  ADD COLUMN IF NOT EXISTS offline_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_reason text;

UPDATE tools tool
SET
  origin_type = CASE candidate.item ->> 'type'
    WHEN 'composite' THEN 'return-composite'
    WHEN 'derived' THEN 'return-derived'
    WHEN 'new' THEN 'return-new'
    ELSE tool.origin_type
  END,
  source_return_id = record.return_id,
  source_candidate_id = record.candidate_id
FROM return_publish_records record
JOIN return_versions returned_version ON returned_version.id = record.return_version_id
LEFT JOIN LATERAL jsonb_array_elements(returned_version.asset_candidates) candidate(item)
  ON candidate.item ->> 'id' = record.candidate_id
WHERE record.tool_id = tool.id;

UPDATE tool_versions version
SET
  source_type = 'return',
  source_return_version_id = record.return_version_id
FROM return_publish_records record
WHERE record.tool_version_id = version.id;

CREATE TABLE IF NOT EXISTS tool_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  tool_version_id uuid REFERENCES tool_versions(id),
  actor_user_id uuid REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'created',
    'metadata-updated',
    'version-created',
    'version-published',
    'version-offline',
    'tool-offline'
  )),
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_asset_events_tool_idx
  ON tool_asset_events (tool_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS tools_admin_catalog_idx
  ON tools (status, origin_type, updated_at DESC, id);

CREATE OR REPLACE FUNCTION protect_released_tool_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.status <> 'offline'
      OR NEW.tool_id IS DISTINCT FROM OLD.tool_id
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.verification IS DISTINCT FROM OLD.verification
      OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
      OR NEW.standard_version IS DISTINCT FROM OLD.standard_version
      OR NEW.risks IS DISTINCT FROM OLD.risks
      OR NEW.artifact_storage_key IS DISTINCT FROM OLD.artifact_storage_key
      OR NEW.artifact_size_bytes IS DISTINCT FROM OLD.artifact_size_bytes
      OR NEW.artifact_sha256 IS DISTINCT FROM OLD.artifact_sha256
      OR NEW.download_url IS DISTINCT FROM OLD.download_url
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.source_type IS DISTINCT FROM OLD.source_type
      OR NEW.source_return_version_id IS DISTINCT FROM OLD.source_return_version_id
      OR NEW.released_at IS DISTINCT FROM OLD.released_at
    THEN
      RAISE EXCEPTION 'PUBLISHED_TOOL_VERSION_IMMUTABLE';
    END IF;
  ELSIF OLD.status = 'offline' THEN
    RAISE EXCEPTION 'OFFLINE_TOOL_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_released_tool_version_trigger ON tool_versions;
CREATE TRIGGER protect_released_tool_version_trigger
  BEFORE UPDATE ON tool_versions
  FOR EACH ROW
  EXECUTE FUNCTION protect_released_tool_version();

CREATE OR REPLACE FUNCTION prevent_tool_lineage_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE ancestors(tool_id) AS (
      SELECT NEW.parent_tool_id
      UNION ALL
      SELECT lineage.parent_tool_id
      FROM tool_lineage lineage
      JOIN ancestors ON lineage.child_tool_id = ancestors.tool_id
    )
    SELECT 1 FROM ancestors WHERE tool_id = NEW.child_tool_id
  ) THEN
    RAISE EXCEPTION 'TOOL_LINEAGE_CYCLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_tool_lineage_cycle_trigger ON tool_lineage;
CREATE TRIGGER prevent_tool_lineage_cycle_trigger
  BEFORE INSERT OR UPDATE ON tool_lineage
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tool_lineage_cycle();
