-- Create a function to atomically increment profile views
CREATE OR REPLACE FUNCTION increment_views(target_wallet TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE profiles
    SET views = COALESCE(views, 0) + 1
    WHERE wallet_address = target_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
