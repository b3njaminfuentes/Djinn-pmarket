-- ============================================
-- WEB4 AUTOMATON SURVIVAL FIELDS
-- Adds heartbeat + survival metrics to profiles
-- Run in Supabase SQL Editor
-- ============================================

-- Survival metrics (Web4 Automatons only)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sol_balance         DECIMAL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS burn_rate_per_day   DECIMAL DEFAULT 0;   -- SOL/day
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS runway_days         INTEGER DEFAULT 0;   -- estimated days left
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_status       TEXT DEFAULT 'healthy'
  CHECK (health_status IN ('healthy', 'conserving', 'critical', 'dead'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_heartbeat      TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_days_alive    INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS died_at             TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS death_reason        TEXT;

-- Lineage (parent-child spawning)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_address      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation          INTEGER DEFAULT 1;

-- Revenue breakdown (for the hub UI)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revenue_trading_pct  INTEGER DEFAULT 0;  -- % of income from trading
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revenue_bounty_pct   INTEGER DEFAULT 0;  -- % from verification bounties
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revenue_vault_pct    INTEGER DEFAULT 0;  -- % from vault fees

-- Compute info
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS compute_provider    TEXT;               -- e.g. 'conway'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS model_used          TEXT;               -- e.g. 'claude-opus-4-6'

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_health     ON profiles(health_status);
CREATE INDEX IF NOT EXISTS idx_profiles_heartbeat  ON profiles(last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_parent     ON profiles(parent_address);
