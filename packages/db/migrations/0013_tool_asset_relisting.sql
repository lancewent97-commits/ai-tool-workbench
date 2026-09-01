ALTER TABLE tool_asset_events
  DROP CONSTRAINT IF EXISTS tool_asset_events_event_type_check;

ALTER TABLE tool_asset_events
  ADD CONSTRAINT tool_asset_events_event_type_check CHECK (event_type IN (
    'created',
    'metadata-updated',
    'version-created',
    'version-published',
    'version-offline',
    'tool-published',
    'tool-offline'
  ));

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
    IF NEW.status <> 'published'
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
      RAISE EXCEPTION 'OFFLINE_TOOL_VERSION_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
