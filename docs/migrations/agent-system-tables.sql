-- ============================================================
-- Agent System Tables Migration
-- Creates: chat_messages, insights
-- Does NOT alter or drop any existing tables
-- ============================================================

-- ─── chat_messages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'trainer', 'nutritionist', 'socius', 'system')),
  content TEXT NOT NULL,
  input_mode TEXT CHECK (input_mode IN ('text', 'voice', 'photo', 'file')),
  input_type TEXT CHECK (input_type IN ('workout_log', 'meal_log', 'question', 'mixed', 'unclear')),
  domain TEXT CHECK (domain IN ('trainer', 'nutritionist', 'socius')),
  confidence DECIMAL,
  related_entity_id UUID,
  related_entity_type TEXT CHECK (related_entity_type IN ('workout', 'meal', 'insight')),
  is_compacted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own messages"
  ON chat_messages FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_user_created ON chat_messages(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_compacted ON chat_messages(user_id, is_compacted);

-- ─── insights ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  pattern_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'notable', 'informational')),
  confidence DECIMAL NOT NULL,
  content TEXT NOT NULL,
  data_context JSONB NOT NULL DEFAULT '{}',
  surfaced_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own insights"
  ON insights FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_insights_user_id ON insights(user_id);
CREATE INDEX idx_insights_user_priority ON insights(user_id, priority, created_at DESC);
CREATE INDEX idx_insights_unsurfaced ON insights(user_id, surfaced_at) WHERE surfaced_at IS NULL;
