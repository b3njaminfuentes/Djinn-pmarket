-- ============================================
-- DJINN HARDENING MIGRATION
-- ============================================

-- 1. ADD CACHED COLUMNS
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gems BIGINT DEFAULT 0;

-- 2. ATOMIC VOLUME INCREMENT
CREATE OR REPLACE FUNCTION increment_market_volume(p_slug TEXT, p_amount DECIMAL)
RETURNS void AS $$
BEGIN
  INSERT INTO market_data (slug, volume, live_price)
  VALUES (p_slug, p_amount, 50)
  ON CONFLICT (slug) 
  DO UPDATE SET 
    volume = market_data.volume + EXCLUDED.volume,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 3. BATCH MARKET RESOLUTION (Fixes Timeout)
CREATE OR REPLACE FUNCTION batch_resolve_market(
  p_slug TEXT, 
  p_winning_outcome TEXT,
  p_resolution_date TIMESTAMP WITH TIME ZONE,
  p_winning_bets JSONB, -- Array of {id, payout}
  p_losing_bets UUID[]  -- Array of ids
)
RETURNS void AS $$
BEGIN
  -- Update Market Status
  UPDATE markets 
  SET resolved = true, 
      winning_outcome = p_winning_outcome, 
      resolution_date = p_resolution_date
  WHERE slug = p_slug;

  -- Update Winners (from JSONB array for flexibility)
  UPDATE bets
  SET payout = (val->>'payout')::DECIMAL
  FROM jsonb_array_elements(p_winning_bets) AS val
  WHERE bets.id = (val->>'id')::UUID;

  -- Update Losers
  UPDATE bets
  SET payout = 0
  WHERE id = ANY(p_losing_bets);
END;
$$ LANGUAGE plpgsql;

-- 4. ATOMIC GEMS ADDITION
CREATE OR REPLACE FUNCTION add_gems(user_wallet TEXT, amount_to_add INT)
RETURNS void AS $$
BEGIN
  UPDATE profiles 
  SET gems = COALESCE(gems, 0) + amount_to_add 
  WHERE wallet_address = user_wallet;
END;
$$ LANGUAGE plpgsql;

-- 5. HARDEN RLS POLICIES
-- Only allow creators or admins to update market data via RPC
ALTER TABLE market_data DISABLE ROW LEVEL SECURITY; -- Move to Service Role only
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can update market data" ON market_data;
CREATE POLICY "Service Role only update market data" ON market_data FOR UPDATE USING (false); -- Restricted

-- Harden Comments (Owner only delete/update)
DROP POLICY IF EXISTS "Anyone can update comments" ON comments;
CREATE POLICY "Owner can update their comments" ON comments
  FOR UPDATE USING (wallet_address = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can delete comments" ON comments; -- If it existed
CREATE POLICY "Owner can delete their comments" ON comments
  FOR DELETE USING (wallet_address = auth.uid()::text);

-- 6. DATA INTEGRITY (Foreign Keys)
ALTER TABLE comments 
  ADD CONSTRAINT fk_market_comments 
  FOREIGN KEY (market_slug) 
  REFERENCES markets(slug) 
  ON DELETE CASCADE;

ALTER TABLE bets 
  ADD CONSTRAINT fk_market_bets 
  FOREIGN KEY (market_slug) 
  REFERENCES markets(slug) 
  ON DELETE CASCADE;

ALTER TABLE activity 
  ADD CONSTRAINT fk_market_activity 
  FOREIGN KEY (market_slug) 
  REFERENCES markets(slug) 
  ON DELETE CASCADE;
