-- US-009: Age verification rate limiting
-- Track verification attempts per user for rate limiting (max 5/day)

CREATE TABLE verification_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_attempts_user_id ON verification_attempts(user_id);
CREATE INDEX idx_verification_attempts_created_at ON verification_attempts(created_at);

-- RLS: users can only read their own attempts
ALTER TABLE verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_attempts_select_own"
  ON verification_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT allowed from service_role only (Edge Functions)
-- No INSERT policy for authenticated users — sessions are created via Edge Function
