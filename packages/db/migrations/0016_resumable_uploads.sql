CREATE TABLE IF NOT EXISTS upload_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('tool', 'return')),
  file_name text NOT NULL,
  expected_bytes bigint NOT NULL CHECK (expected_bytes > 0),
  chunk_size_bytes integer NOT NULL CHECK (chunk_size_bytes > 0),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'completed', 'aborted', 'expired')),
  artifact_storage_key text,
  artifact_sha256 text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_sessions_owner_status_idx
  ON upload_sessions(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS upload_parts (
  upload_id uuid NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  part_number integer NOT NULL CHECK (part_number > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, part_number)
);
