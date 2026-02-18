-- ============================================
-- EMAIL WAITLIST — Hype generation
-- Anyone can join, no wallet required
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS email_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  twitter_handle TEXT,                      -- optional @handle (without @)
  referral_code TEXT,                       -- how they heard about us
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON email_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON email_waitlist(created_at DESC);

-- RLS
ALTER TABLE email_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Waitlist readable by service" ON email_waitlist;
DROP POLICY IF EXISTS "Waitlist writable by all" ON email_waitlist;

CREATE POLICY "Waitlist readable by service" ON email_waitlist FOR SELECT USING (true);
CREATE POLICY "Waitlist writable by all" ON email_waitlist FOR INSERT WITH CHECK (true);
