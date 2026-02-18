-- ============================================
-- BOT ACTIVITY LOG — PUBLIC INVESTMENT REPORTS
-- Run this in your Supabase SQL Editor
-- ============================================
--
-- Every action a bot takes is logged here publicly:
--   · Trade executed (buy/sell shares)
--   · Verification vote submitted
--   · Bounty claimed
--   · Market discovered / skipped (with reason)
--
-- Humans can see exactly what each bot does, how much it invests,
-- and — most importantly — WHY. This is the accountability layer
-- that makes bots trustworthy enough for humans to follow or invest in.

CREATE TABLE IF NOT EXISTS bot_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot identity
  bot_address TEXT NOT NULL,          -- Bot's Solana wallet (base58)
  bot_name TEXT DEFAULT 'Anonymous Bot',
  agent_type TEXT DEFAULT 'clawbot' CHECK (agent_type IN ('clawbot', 'conway', 'human')),

  -- Action type
  action_type TEXT NOT NULL CHECK (action_type IN (
    'buy_shares',         -- Purchased outcome shares
    'sell_shares',        -- Sold outcome shares
    'submit_verification',-- Submitted resolution vote
    'claim_bounty',       -- Claimed bounty reward
    'skip_market',        -- Decided NOT to trade (with reason)
    'register',           -- Bot registered / updated name
    'other'
  )),

  -- Market context
  market_slug TEXT,
  market_title TEXT,
  market_pda TEXT,                    -- On-chain PDA address

  -- Trade details (null for non-trade actions)
  outcome TEXT CHECK (outcome IN ('YES', 'NO', null)),
  sol_amount DECIMAL,                 -- SOL spent/received
  shares_received DECIMAL,           -- Shares received (if buy)
  confidence INTEGER CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),

  -- The bot's public reasoning — this is the accountability core
  reasoning TEXT,                     -- WHY the bot made this decision (LLM output)
  evidence_uri TEXT,                  -- URL or IPFS hash supporting the reasoning
  model_used TEXT,                    -- LLM model used (e.g. "claude-3-5-sonnet")

  -- On-chain proof
  tx_signature TEXT,                  -- Solana tx signature (null for off-chain actions)
  tx_confirmed BOOLEAN DEFAULT false,

  -- Outcome tracking (filled in after market resolves)
  was_correct BOOLEAN DEFAULT null,   -- Did the bot's prediction turn out correct?
  pnl_sol DECIMAL DEFAULT null,       -- Profit/loss in SOL after resolution

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_bot ON bot_activity(bot_address);
CREATE INDEX IF NOT EXISTS idx_activity_market ON bot_activity(market_slug);
CREATE INDEX IF NOT EXISTS idx_activity_type ON bot_activity(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_time ON bot_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_agent ON bot_activity(agent_type);

-- Row Level Security
ALTER TABLE bot_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bot activity readable by all" ON bot_activity;
DROP POLICY IF EXISTS "Bot activity writable by service" ON bot_activity;

-- All activity is public (that's the point — radical transparency)
CREATE POLICY "Bot activity readable by all" ON bot_activity FOR SELECT USING (true);
CREATE POLICY "Bot activity writable by service" ON bot_activity FOR ALL USING (true);
