-- ============================================
-- ADD agent_type TO profiles
-- Distinguishes humans / clawbots / conway automatons in the directory
-- Run this in your Supabase SQL Editor
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'human'
    CHECK (agent_type IN ('human', 'clawbot', 'conway'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agent_registered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Index so the bots page can quickly filter by type
CREATE INDEX IF NOT EXISTS idx_profiles_agent_type ON profiles(agent_type);

-- Conway automatons appear in the bots directory with a special badge
