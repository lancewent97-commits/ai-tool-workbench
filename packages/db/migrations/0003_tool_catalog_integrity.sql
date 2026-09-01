DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tool_versions_tool_id_id_unique'
  ) THEN
    ALTER TABLE tool_versions
      ADD CONSTRAINT tool_versions_tool_id_id_unique UNIQUE (tool_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tools_latest_version_ownership_fk'
  ) THEN
    ALTER TABLE tools
      ADD CONSTRAINT tools_latest_version_ownership_fk
      FOREIGN KEY (id, latest_version_id)
      REFERENCES tool_versions (tool_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tool_lineage_parent_version_ownership_fk'
  ) THEN
    ALTER TABLE tool_lineage
      ADD CONSTRAINT tool_lineage_parent_version_ownership_fk
      FOREIGN KEY (parent_tool_id, parent_version_id)
      REFERENCES tool_versions (tool_id, id);
  END IF;
END
$$;
