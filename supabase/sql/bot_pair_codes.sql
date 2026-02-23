-- Create bot_pair_codes table for npx @djinn/skill pairing flow
CREATE TABLE IF NOT EXISTS bot_pair_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    bot_wallet TEXT NOT NULL UNIQUE,
    bot_name TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    linked_at TIMESTAMPTZ,
    linked_human_wallet TEXT
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_bot_pair_codes_code ON bot_pair_codes(code);
CREATE INDEX IF NOT EXISTS idx_bot_pair_codes_bot_wallet ON bot_pair_codes(bot_wallet);

-- Auto-cleanup expired codes (optional: run via cron)
-- DELETE FROM bot_pair_codes WHERE expires_at < now() AND used = false;
