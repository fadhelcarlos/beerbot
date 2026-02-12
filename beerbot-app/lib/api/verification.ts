import { supabase } from '@/lib/supabase';
import type { VerificationSession, VerificationStatus } from '@/types/api';

/**
 * Call the create-verification-session Edge Function to start a Veriff
 * age verification flow. Returns the session URL/token for the mobile SDK.
 * Rate limited to 5 attempts per user per day (enforced server-side).
 */
export async function createVerificationSession(): Promise<VerificationSession> {
  const { data, error } = await supabase.functions.invoke<VerificationSession>(
    'create-verification-session',
    { method: 'POST' },
  );

  if (error) throw error;
  if (!data) throw new Error('No data returned from verification session');

  return data;
}

/**
 * Check the current user's age verification status by reading their
 * profile from the users table.
 */
export async function checkVerificationStatus(): Promise<VerificationStatus> {
  const { data, error } = await supabase
    .from('users')
    .select('age_verified, age_verification_ref, age_verified_at')
    .single();

  if (error) throw error;

  return {
    age_verified: data.age_verified,
    age_verification_ref: data.age_verification_ref,
    age_verified_at: data.age_verified_at,
  };
}
