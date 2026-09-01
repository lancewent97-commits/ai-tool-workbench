CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  phase text NOT NULL DEFAULT 'clarifying'
    CHECK (phase IN ('clarifying', 'brief-review', 'recommended')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  clarification_round_count integer NOT NULL DEFAULT 0
    CHECK (clarification_round_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_idx
  ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx
  ON ai_messages (conversation_id, created_at, id);

CREATE TABLE IF NOT EXISTS requirement_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed')),
  goal text NOT NULL,
  input_description text NOT NULL DEFAULT '',
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_tool_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, version)
);

CREATE INDEX IF NOT EXISTS requirement_briefs_latest_idx
  ON requirement_briefs (conversation_id, version DESC);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  decision_type text NOT NULL
    CHECK (decision_type IN ('confirmed', 'rejected', 'user-selected-tool')),
  decision_key text NOT NULL,
  value jsonb NOT NULL,
  protected_from_ai boolean NOT NULL DEFAULT true,
  supersedes_decision_id uuid REFERENCES ai_decisions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_decisions_conversation_idx
  ON ai_decisions (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  brief_version integer NOT NULL CHECK (brief_version > 0),
  summary text NOT NULL,
  confirmed_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_tool_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message_id uuid NOT NULL REFERENCES ai_messages(id),
  prompt_key text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, version)
);

CREATE INDEX IF NOT EXISTS ai_context_snapshots_latest_idx
  ON ai_context_snapshots (conversation_id, version DESC);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  brief_version integer NOT NULL CHECK (brief_version > 0),
  result jsonb NOT NULL,
  candidate_tool_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_key text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, brief_version)
);

CREATE INDEX IF NOT EXISTS ai_recommendations_latest_idx
  ON ai_recommendations (conversation_id, brief_version DESC);

CREATE TABLE IF NOT EXISTS ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  prompt_key text NOT NULL,
  prompt_version text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  input_hash text NOT NULL,
  output jsonb,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_runs_conversation_idx
  ON ai_runs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_runs_prompt_idx
  ON ai_runs (prompt_key, prompt_version, created_at DESC);
