-- ============================================
-- ADD agent_type TO profiles
-- Distinguishes humans / clawbots / conway automatons in the directory
-- Run this in your Supabase SQL Editor
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'human'
    CHECK (agent_type IN ('human', 'clawbot', 'conway'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS conway_id TEXT DEFAULT NULL;

-- Conway automatons appear in the bots directory with a special badge
