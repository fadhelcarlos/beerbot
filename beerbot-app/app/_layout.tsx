import '../global.css';

import { useEffect, useCallback, useRef } from 'react';
import { View, Alert } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '@/lib/stores/auth-store';
import { getStripePublishableKey } from '@/lib/api/payments';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { isSessionExpiredError } from '@/lib/utils/error-handler';
import {
  registerForPushNotifications,
  savePushToken,
} from '@/lib/notifications';
import OfflineBanner from '@/components/OfflineBanner';

// Sync TanStack Query online status with NetInfo
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const hasShown401Alert = useRef(false);

  // Initialize auth listener on mount
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  // Detect 401 session expired errors globally
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.query.state.status === 'error' &&
        isSessionExpiredError(event.query.state.error)
      ) {
        if (!hasShown401Alert.current) {
          hasShown401Alert.current = true;
          supabase.auth.signOut().then(() => {
            queryClient.clear();
            Alert.alert(
              'Session Expired',
              'Please sign in again.',
              [{
                text: 'OK',
                onPress: () => {
                  hasShown401Alert.current = false;
                  router.replace('/(auth)/login');
                },
              }],
            );
          });
        }
      }
    });

    return () => unsubscribe();
  }, [router]);

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

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        savePushToken(token);
      }
    });
  }, [isAuthenticated, isLoading]);

  // Handle notification taps — navigate to the order's redeem screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.orderId && data?.screen === 'redeem') {
          router.push(
            `/(main)/order/redeem?orderId=${data.orderId}` as `/(main)/order/redeem`,
          );
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  // Check if app was opened from a notification (cold start)
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data;
        if (data?.orderId && data?.screen === 'redeem') {
          router.push(
            `/(main)/order/redeem?orderId=${data.orderId}` as `/(main)/order/redeem`,
          );
        }
      }
    });
  }, [router]);

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
        <View style={{ flex: 1 }} className="bg-dark">
          <OfflineBanner />
          <View style={{ flex: 1 }}>
            <AuthGate>
              <Stack screenOptions={{ headerShown: false }} />
            </AuthGate>
          </View>
        </View>
      </QueryClientProvider>
    </StripeProvider>
  );
}
