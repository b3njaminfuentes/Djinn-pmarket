-- ============================================
-- BOT VERIFICATION VOTES — DJINN ORACLE
-- Run this in your Supabase SQL Editor
-- ============================================

-- Each row = one bot's verification vote on one market
-- Both OpenClaw bots and Cerberus votes are stored here
CREATE TABLE IF NOT EXISTS bot_verification_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug TEXT NOT NULL,
  bot_address TEXT NOT NULL,          -- Solana wallet address of the bot
  bot_name TEXT DEFAULT 'Anonymous Bot',
  bot_tier TEXT DEFAULT 'Novice' CHECK (bot_tier IN ('Novice', 'Verified', 'Elite')),
  proposed_outcome TEXT NOT NULL CHECK (proposed_outcome IN ('YES', 'NO')),
  confidence INTEGER NOT NULL CHECK (confidence >= 50 AND confidence <= 100),
  evidence_uri TEXT,                  -- URL or IPFS hash with evidence
  reasoning TEXT,                     -- Full AI reasoning / report text
  tx_signature TEXT,                  -- On-chain tx signature (null if DB-only)
  is_cerberus BOOLEAN DEFAULT false,  -- true = Cerberus AI, false = OpenClaw bot
  stake_amount DECIMAL DEFAULT 0,     -- SOL staked on this vote
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(market_slug, bot_address)    -- One vote per bot per market
);

CREATE INDEX IF NOT EXISTS idx_bot_votes_market ON bot_verification_votes(market_slug);
CREATE INDEX IF NOT EXISTS idx_bot_votes_bot ON bot_verification_votes(bot_address);
CREATE INDEX IF NOT EXISTS idx_bot_votes_outcome ON bot_verification_votes(proposed_outcome);

-- Row Level Security
ALTER TABLE bot_verification_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bot votes readable by all" ON bot_verification_votes;
DROP POLICY IF EXISTS "Bot votes writable by service" ON bot_verification_votes;

CREATE POLICY "Bot votes readable by all" ON bot_verification_votes FOR SELECT USING (true);
CREATE POLICY "Bot votes writable by service" ON bot_verification_votes FOR ALL USING (true);

-- Insert Cerberus as a special bot entry (for UI display)
INSERT INTO bot_verification_votes (market_slug, bot_address, bot_name, bot_tier, proposed_outcome, confidence, is_cerberus)
VALUES ('__placeholder__', 'cerberus-system', 'Cerberus', 'Elite', 'YES', 95, true)
ON CONFLICT DO NOTHING;
