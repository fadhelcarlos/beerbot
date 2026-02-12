import { supabase } from '@/lib/supabase';
import type { VerificationSession, VerificationStatus } from '@/types/api';

/**
 * Call the create-verification-session Edge Function to start a Veriff
 * age verification flow. Returns the session URL/token for the mobile SDK.
 * Rate limited to 5 attempts per user per day (enforced server-side).
 */
export async function createVerificationSession(): Promise<VerificationSession> {
  try {
    const { data, error } = await supabase.functions.invoke<VerificationSession>(
      'create-verification-session',
      { method: 'POST' },
    );

    if (error) {
      // Handle common Edge Function errors with user-friendly messages
      const errorMessage = error.message ?? String(error);

      if (
        errorMessage.includes('non-2xx') ||
        errorMessage.includes('Edge Function') ||
        errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503')
      ) {
        throw new Error(
          'Age verification service is temporarily unavailable. Please try again later.',
        );
      }

      if (errorMessage.includes('rate') || errorMessage.includes('429')) {
        throw new Error(
          'Too many verification attempts. Please try again later.',
        );
      }

      if (errorMessage.includes('already verified') || errorMessage.includes('400')) {
        throw new Error('already verified');
      }

      throw new Error(
        'Unable to start verification. Please check your connection and try again.',
      );
    }

    if (!data) {
      throw new Error(
        'Age verification service is temporarily unavailable. Please try again later.',
      );
    }

    return data;
  } catch (err) {
    // Re-throw our user-friendly errors
    if (err instanceof Error) throw err;
    // Catch-all for unexpected errors
    throw new Error(
      'Age verification service is temporarily unavailable. Please try again later.',
    );
  }
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
