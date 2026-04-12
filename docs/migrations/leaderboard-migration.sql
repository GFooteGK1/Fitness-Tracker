-- Leaderboard System Database Schema
-- Run this in your Supabase SQL Editor

-- Leaderboard Groups (a gym/box leaderboard)
CREATE TABLE leaderboard_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Memberships
CREATE TABLE group_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES leaderboard_groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  display_name TEXT NOT NULL,
  privacy_level TEXT NOT NULL DEFAULT 'all' CHECK (privacy_level IN ('all', 'benchmarks', 'manual')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_leaderboard_groups_invite ON leaderboard_groups(invite_code);
CREATE INDEX idx_leaderboard_groups_created_by ON leaderboard_groups(created_by);
CREATE INDEX idx_group_memberships_group ON group_memberships(group_id);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id);
CREATE INDEX idx_group_memberships_group_user ON group_memberships(group_id, user_id);

-- Row Level Security
ALTER TABLE leaderboard_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;

-- Leaderboard Groups policies
-- Anyone authenticated can create a group
CREATE POLICY "Authenticated users can create groups"
  ON leaderboard_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Members can view groups they belong to
CREATE POLICY "Members can view their groups"
  ON leaderboard_groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_memberships.group_id = leaderboard_groups.id
      AND group_memberships.user_id = auth.uid()
    )
    OR created_by = auth.uid()
  );

-- Only creator can delete a group
CREATE POLICY "Creator can delete their groups"
  ON leaderboard_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Allow reading a group by invite code for joining (before membership exists)
CREATE POLICY "Anyone can read group by invite code"
  ON leaderboard_groups FOR SELECT
  TO authenticated
  USING (true);

-- Group Memberships policies
-- Users can join groups (insert their own membership)
CREATE POLICY "Users can join groups"
  ON group_memberships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members can view other memberships in their groups
CREATE POLICY "Members can view group memberships"
  ON group_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships AS my_membership
      WHERE my_membership.group_id = group_memberships.group_id
      AND my_membership.user_id = auth.uid()
    )
  );

-- Users can update their own membership (display name, privacy)
CREATE POLICY "Users can update their own membership"
  ON group_memberships FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can leave groups (delete their own membership)
CREATE POLICY "Users can leave groups"
  ON group_memberships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Grant group members read access to each other's workouts for rankings
-- This uses a security definer function to bypass workout RLS
CREATE OR REPLACE FUNCTION get_group_member_workouts(
  p_group_id UUID,
  p_exercise TEXT DEFAULT NULL,
  p_period TEXT DEFAULT 'all',
  p_requesting_user UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  workout_id UUID,
  workout_date DATE,
  input_text TEXT,
  blocks JSONB,
  privacy_level TEXT
) AS $$
BEGIN
  -- Verify the requesting user is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_memberships.group_id = p_group_id
    AND group_memberships.user_id = p_requesting_user
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    gm.display_name,
    w.id AS workout_id,
    w.workout_date,
    w.input_text,
    w.blocks,
    gm.privacy_level
  FROM group_memberships gm
  JOIN workouts w ON w.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
  AND (
    p_period = 'all'
    OR (p_period = 'week' AND w.workout_date >= CURRENT_DATE - INTERVAL '7 days')
    OR (p_period = 'month' AND w.workout_date >= CURRENT_DATE - INTERVAL '30 days')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get benchmark PRs for group members
CREATE OR REPLACE FUNCTION get_group_member_prs(
  p_group_id UUID,
  p_benchmark_name TEXT DEFAULT NULL,
  p_period TEXT DEFAULT 'all',
  p_requesting_user UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  benchmark_name TEXT,
  score_value DECIMAL,
  score_display TEXT,
  rx_status TEXT,
  date DATE,
  is_pr BOOLEAN,
  privacy_level TEXT
) AS $$
BEGIN
  -- Verify the requesting user is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_memberships.group_id = p_group_id
    AND group_memberships.user_id = p_requesting_user
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    gm.display_name,
    bp.benchmark_name,
    bp.score_value,
    bp.score_display,
    bp.rx_status,
    bp.date,
    bp.is_pr,
    gm.privacy_level
  FROM group_memberships gm
  JOIN benchmark_prs bp ON bp.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
  AND (p_benchmark_name IS NULL OR bp.benchmark_name = p_benchmark_name)
  AND (
    p_period = 'all'
    OR (p_period = 'week' AND bp.date >= CURRENT_DATE - INTERVAL '7 days')
    OR (p_period = 'month' AND bp.date >= CURRENT_DATE - INTERVAL '30 days')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-set user_id on group_memberships
CREATE TRIGGER set_membership_user_id
  BEFORE INSERT ON group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id();
