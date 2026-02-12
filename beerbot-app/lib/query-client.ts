import { QueryClient } from '@tanstack/react-query';
import { isSessionExpiredError } from '@/lib/utils/error-handler';

/**
 * Exponential backoff delay: 1s, 2s, 4s (capped at 3 retries).
 */
function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: (failureCount, error) => {
        // Never retry on 401 — session expired should redirect to login
        if (isSessionExpiredError(error)) return false;
        return failureCount < 3;
      },
      retryDelay,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isSessionExpiredError(error)) return false;
        return failureCount < 3;
      },
      retryDelay,
    },
  },
});
