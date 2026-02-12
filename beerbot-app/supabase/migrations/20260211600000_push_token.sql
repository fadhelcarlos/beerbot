-- Add push_token column to users table for push notification support
ALTER TABLE users ADD COLUMN push_token text;

-- Allow authenticated users to update their own push_token
-- (The existing users UPDATE policy already covers this since it allows
--  UPDATE on own row where id = auth.uid())
