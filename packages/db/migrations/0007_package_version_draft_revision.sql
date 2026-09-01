ALTER TABLE package_versions
  ADD COLUMN IF NOT EXISTS draft_revision integer;

UPDATE package_versions
SET draft_revision = COALESCE(
  (draft_snapshot ->> 'revision')::integer,
  1
)
WHERE draft_revision IS NULL;

ALTER TABLE package_versions
  ALTER COLUMN draft_revision SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'package_versions_draft_revision_positive'
  ) THEN
    ALTER TABLE package_versions
      ADD CONSTRAINT package_versions_draft_revision_positive
      CHECK (draft_revision > 0);
  END IF;
END
$$;
