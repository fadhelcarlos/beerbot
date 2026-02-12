/**
 * Centralized error formatting utility.
 * Maps API errors, Supabase errors, and network errors to user-friendly messages.
 * Never exposes raw error codes or stack traces to users.
 */

// Known Supabase auth error codes
const AUTH_ERROR_MAP: Record<string, string> = {
  invalid_credentials: 'Invalid email or password. Please try again.',
  user_already_exists: 'An account with this email already exists.',
  email_not_confirmed: 'Please check your email to confirm your account.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  invalid_grant: 'Your session has expired. Please sign in again.',
  user_not_found: 'No account found with this email.',
  weak_password: 'Password is too weak. Please use at least 8 characters.',
  same_password: 'New password must be different from the current password.',
};

// HTTP status code to user-friendly message
const HTTP_STATUS_MAP: Record<number, string> = {
  400: 'Something went wrong with your request. Please try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You don\'t have permission to do this.',
  404: 'The requested item was not found.',
  409: 'This action conflicts with the current state. Please refresh and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again later.',
  502: 'Service temporarily unavailable. Please try again later.',
  503: 'Service temporarily unavailable. Please try again later.',
};

interface SupabaseError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Returns true if the error indicates an expired/invalid session (401).
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as SupabaseError;
    if (err.status === 401) return true;
    if (err.code === 'invalid_grant' || err.code === 'PGRST301') return true;
    if (err.message?.includes('JWT expired')) return true;
    if (err.message?.includes('invalid claim: missing sub claim')) return true;
  }
  return false;
}

/**
 * Formats any error into a user-friendly string.
 * Never exposes raw error codes, stack traces, or technical details.
 */
export function formatErrorMessage(error: unknown): string {
  // Network/offline errors
  if (error instanceof TypeError && error.message === 'Network request failed') {
    return 'No internet connection. Please check your network and try again.';
  }

  // Supabase / API errors with code
  if (error && typeof error === 'object') {
    const err = error as SupabaseError;

    // Check auth error codes first
    if (err.code && AUTH_ERROR_MAP[err.code]) {
      return AUTH_ERROR_MAP[err.code];
    }

    // Check HTTP status codes
    if (err.status && HTTP_STATUS_MAP[err.status]) {
      return HTTP_STATUS_MAP[err.status];
    }

    // Supabase error messages that are already user-friendly
    if (err.message) {
      // Filter out technical messages
      if (
        err.message.includes('FetchError') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('AbortError')
      ) {
        return 'Unable to connect to the server. Please check your connection and try again.';
      }

      // Rate limit messages from Edge Functions
      if (err.message.includes('rate limit') || err.message.includes('Too many')) {
        return 'Too many attempts. Please wait a moment and try again.';
      }
    }
  }

  // Standard Error objects
  if (error instanceof Error) {
    // Network-related
    if (error.message.includes('Network request failed')) {
      return 'No internet connection. Please check your network and try again.';
    }
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return 'Request timed out. Please try again.';
    }

    // Return the message if it looks user-safe (no stack traces, no technical jargon)
    const msg = error.message;
    if (msg.length < 200 && !msg.includes('at ') && !msg.includes('Error:')) {
      return msg;
    }
  }

  // Fallback
  return 'Something went wrong. Please try again.';
}

/**
 * Extracts an error message from a caught error for use in API calls.
 * Convenience wrapper around formatErrorMessage for try/catch blocks.
 */
export function getApiErrorMessage(error: unknown): string {
  return formatErrorMessage(error);
}
