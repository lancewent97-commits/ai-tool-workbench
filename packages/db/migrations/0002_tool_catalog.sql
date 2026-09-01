CREATE TABLE IF NOT EXISTS tool_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'offline')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'offline')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'offline')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  problem text NOT NULL,
  result text NOT NULL,
  principle text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('executable', 'knowledge', 'template', 'application', 'composite')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'offline')),
  primary_category_id uuid REFERENCES tool_categories(id),
  latest_version_id uuid,
  created_by_user_id uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tools_catalog_idx
  ON tools (status, published_at DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS tool_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'offline')),
  verification text NOT NULL DEFAULT 'unverified'
    CHECK (verification IN ('verified', 'partly-verified', 'unverified')),
  change_summary text NOT NULL DEFAULT '',
  standard_version text NOT NULL DEFAULT '1',
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_storage_key text,
  artifact_size_bytes bigint CHECK (artifact_size_bytes IS NULL OR artifact_size_bytes >= 0),
  artifact_sha256 text,
  download_url text,
  created_by_user_id uuid REFERENCES users(id),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tool_id, version)
);

CREATE INDEX IF NOT EXISTS tool_versions_tool_idx
  ON tool_versions (tool_id, released_at DESC, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tools_latest_version_fk'
  ) THEN
    ALTER TABLE tools
      ADD CONSTRAINT tools_latest_version_fk
      FOREIGN KEY (latest_version_id) REFERENCES tool_versions(id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tool_module_placements (
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES tool_modules(id),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, module_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tool_primary_module_unique
  ON tool_module_placements (tool_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS tool_module_catalog_idx
  ON tool_module_placements (module_id, sort_order, tool_id);

CREATE TABLE IF NOT EXISTS tool_tag_assignments (
  tool_id uuid NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tool_tags(id),
  PRIMARY KEY (tool_id, tag_id)
);

CREATE INDEX IF NOT EXISTS tool_tag_catalog_idx
  ON tool_tag_assignments (tag_id, tool_id);

CREATE TABLE IF NOT EXISTS tool_lineage (
  child_tool_id uuid PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
  parent_tool_id uuid NOT NULL REFERENCES tools(id),
  parent_version_id uuid NOT NULL REFERENCES tool_versions(id),
  difference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (child_tool_id <> parent_tool_id)
);

CREATE INDEX IF NOT EXISTS tool_lineage_parent_idx
  ON tool_lineage (parent_tool_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tool_metrics (
  tool_id uuid PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
  download_count bigint NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  rating_average numeric(3,2) CHECK (
    rating_average IS NULL OR (rating_average >= 0 AND rating_average <= 5)
  ),
  rating_count bigint NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_adoption_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES tools(id),
  tool_version_id uuid NOT NULL REFERENCES tool_versions(id),
  user_id uuid REFERENCES users(id),
  department_id uuid REFERENCES departments(id),
  job_function_id uuid REFERENCES job_functions(id),
  event_type text NOT NULL
    CHECK (event_type IN ('download', 'use_report', 'rating')),
  rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_adoption_events_tool_idx
  ON tool_adoption_events (tool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tool_adoption_events_user_idx
  ON tool_adoption_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
