import '../global.css';

import { useEffect, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/lib/stores/auth-store';
import { getStripePublishableKey } from '@/lib/api/payments';

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  // Initialize auth listener on mount
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  // Handle deep link URLs for password recovery
  const handleDeepLink = useCallback(
    (url: string) => {
      // Supabase sends tokens in hash fragment: beerbot://reset-password#access_token=...&refresh_token=...
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return;

      const fragment = url.substring(hashIndex + 1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (type === 'recovery' && accessToken && refreshToken) {
        router.replace({
          pathname: '/(auth)/reset-password',
          params: { access_token: accessToken, refresh_token: refreshToken },
        });
      }
    },
    [router],
  );

  // Listen for incoming deep links
  useEffect(() => {
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Listen for deep links while app is open
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, [handleDeepLink]);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onResetPassword = (segments as string[])[1] === 'reset-password';

    if (isAuthenticated && inAuthGroup && !onResetPassword) {
      // Authenticated user on auth screen (except reset-password) — redirect to main
      router.replace('/(main)/venues');
    } else if (!isAuthenticated && !inAuthGroup && segments.length > 0) {
      // Unauthenticated user on main screen — redirect to auth
      router.replace('/(auth)/welcome');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <StripeProvider
      publishableKey={getStripePublishableKey()}
      merchantIdentifier="merchant.com.beerbot.app"
      urlScheme="beerbot"
    >
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGate>
      </QueryClientProvider>
    </StripeProvider>
  );
}
