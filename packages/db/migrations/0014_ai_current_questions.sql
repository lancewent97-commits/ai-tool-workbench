ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS current_questions jsonb NOT NULL DEFAULT '[]'::jsonb;
