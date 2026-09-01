CREATE TABLE IF NOT EXISTS package_drafts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL
    CHECK (id ~ '^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$'),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('ai', 'manual')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'archived')),
  name text NOT NULL,
  goal text,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  planned_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_confirmed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (
    (source = 'ai' AND conversation_id IS NOT NULL)
    OR source = 'manual'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS package_drafts_conversation_unique
  ON package_drafts (conversation_id)
  WHERE conversation_id IS NOT NULL AND status <> 'archived';

CREATE INDEX IF NOT EXISTS package_drafts_user_updated_idx
  ON package_drafts (user_id, updated_at DESC);
