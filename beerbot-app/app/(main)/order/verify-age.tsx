import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import {
  checkVerificationStatus,
  createVerificationSession,
} from '@/lib/api/verification';

const MAX_ATTEMPTS = 3;

type ScreenState =
  | 'checking'
  | 'explanation'
  | 'loading_session'
  | 'verifying'
  | 'processing'
  | 'success'
  | 'failed';

// ─────────────────────────────────────────────────
// Failure Reason Display
// ─────────────────────────────────────────────────

function mapFailureReason(url: string): string {
  if (url.includes('not_readable') || url.includes('document'))
    return 'ID not readable. Please ensure your ID is clear and well-lit.';
  if (url.includes('liveness') || url.includes('face'))
    return 'Liveness check failed. Please look directly at the camera.';
  if (url.includes('expired'))
    return 'Session expired. Please try again.';
  return 'Verification was not successful. Please try again.';
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function VerifyAgeScreen() {
  const { tapId, venueId, quantity, totalPrice } = useLocalSearchParams<{
    tapId: string;
    venueId: string;
    quantity: string;
    totalPrice: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [screenState, setScreenState] = useState<ScreenState>('checking');
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [rememberVerification, setRememberVerification] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [failureReason, setFailureReason] = useState('');
  const webviewRef = useRef<WebView>(null);
  const hasNavigated = useRef(false);

  // Forward params for the payment screen (memoized to avoid dependency churn)
  const orderParams = useMemo(
    () => ({
      tapId: tapId ?? '',
      venueId: venueId ?? '',
      quantity: quantity ?? '1',
      totalPrice: totalPrice ?? '0',
    }),
    [tapId, venueId, quantity, totalPrice],
  );

  // ─────────────────────────────────────────────────
  // Check existing verification status
  // ─────────────────────────────────────────────────

  const statusQuery = useQuery({
    queryKey: ['verification-status'],
    queryFn: checkVerificationStatus,
    staleTime: 1000 * 10,
    retry: false,
  });

  // Auto-skip if already verified
  useEffect(() => {
    if (statusQuery.isLoading) return;
    if (hasNavigated.current) return;

    if (statusQuery.data?.age_verified) {
      hasNavigated.current = true;
      router.replace({
        pathname: '/(main)/order/payment',
        params: orderParams,
      });
    } else if (statusQuery.isSuccess) {
      setScreenState('explanation');
    } else if (statusQuery.isError) {
      // Even on error, show explanation — verification will be attempted anyway
      setScreenState('explanation');
    }
  }, [
    statusQuery.isLoading,
    statusQuery.data,
    statusQuery.isSuccess,
    statusQuery.isError,
    router,
    orderParams,
  ]);

  // ─────────────────────────────────────────────────
  // Start Verification Session
  // ─────────────────────────────────────────────────

  const startVerification = useCallback(async () => {
    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert(
        'Too Many Attempts',
        'You have exceeded the maximum number of verification attempts. Please contact support.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }

    setScreenState('loading_session');
    setFailureReason('');

    try {
      const session = await createVerificationSession();
      setSessionUrl(session.session_url);
      setScreenState('verifying');
      setAttempts((prev) => prev + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to start verification';

      if (message.includes('rate') || message.includes('429')) {
        Alert.alert(
          'Rate Limited',
          'Too many verification attempts. Please try again later.',
          [{ text: 'OK' }],
        );
        setScreenState('explanation');
      } else if (message.includes('already verified') || message.includes('400')) {
        // Race condition: user got verified between check and start
        hasNavigated.current = true;
        router.replace({
          pathname: '/(main)/order/payment',
          params: orderParams,
        });
      } else {
        Alert.alert('Error', message, [{ text: 'OK' }]);
        setScreenState('explanation');
      }
    }
  }, [attempts, router, orderParams]);

  // ─────────────────────────────────────────────────
  // Handle Veriff WebView Navigation
  // ─────────────────────────────────────────────────

  const handleNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState;
      if (!url) return;

      // Veriff redirects to a result URL on completion
      if (url.includes('/result') || url.includes('status=')) {
        if (url.includes('approved') || url.includes('success') || url.includes('9001')) {
          setScreenState('processing');
          // Poll for verification status update
          const pollInterval = setInterval(async () => {
            try {
              const status = await checkVerificationStatus();
              if (status.age_verified) {
                clearInterval(pollInterval);
                setScreenState('success');
                setTimeout(() => {
                  if (!hasNavigated.current) {
                    hasNavigated.current = true;
                    router.replace({
                      pathname: '/(main)/order/payment',
                      params: orderParams,
                    });
                  }
                }, 1200);
              }
            } catch {
              // Keep polling
            }
          }, 2000);

          // Stop polling after 30s
          setTimeout(() => {
            clearInterval(pollInterval);
            if (screenState === 'processing') {
              // Webhook might be slow — navigate anyway, payment screen will re-check
              hasNavigated.current = true;
              router.replace({
                pathname: '/(main)/order/payment',
                params: orderParams,
              });
            }
          }, 30000);
        } else if (url.includes('declined') || url.includes('failed') || url.includes('9102')) {
          setFailureReason(mapFailureReason(url));
          setScreenState('failed');
        } else if (url.includes('resubmit') || url.includes('9103')) {
          setFailureReason('ID not readable. Please ensure your ID is clear and well-lit.');
          setScreenState('failed');
        } else if (url.includes('expired') || url.includes('9104')) {
          setFailureReason('Session expired. Please try again.');
          setScreenState('failed');
        }
      }
    },
    [router, orderParams, screenState],
  );

  // ─────────────────────────────────────────────────
  // Handle WebView errors
  // ─────────────────────────────────────────────────

  const handleWebViewError = useCallback(() => {
    setFailureReason('A connection error occurred. Please check your network and try again.');
    setScreenState('failed');
  }, []);

  // ─────────────────────────────────────────────────
  // Render: Checking State
  // ─────────────────────────────────────────────────

  if (screenState === 'checking') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">
          Checking verification status...
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Veriff WebView
  // ─────────────────────────────────────────────────

  if (screenState === 'verifying' && sessionUrl) {
    return (
      <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
        {/* Header with cancel */}
        <View className="px-6 py-3 flex-row items-center justify-between border-b border-dark-600">
          <Text className="text-lg font-semibold text-white">
            Age Verification
          </Text>
          <Pressable
            onPress={() => {
              Alert.alert(
                'Cancel Verification?',
                'Your progress will be lost.',
                [
                  { text: 'Continue Verifying', style: 'cancel' },
                  {
                    text: 'Cancel',
                    style: 'destructive',
                    onPress: () => setScreenState('explanation'),
                  },
                ],
              );
            }}
            hitSlop={16}
            className="active:opacity-60"
          >
            <Text className="text-brand text-base">Cancel</Text>
          </Pressable>
        </View>

        <WebView
          ref={webviewRef}
          source={{ uri: sessionUrl }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          onNavigationStateChange={handleNavigationChange}
          onError={handleWebViewError}
          onHttpError={(syntheticEvent) => {
            const { statusCode } = syntheticEvent.nativeEvent;
            if (statusCode >= 400) {
              handleWebViewError();
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View className="absolute inset-0 bg-dark items-center justify-center">
              <ActivityIndicator color="#f59e0b" size="large" />
              <Text className="text-white/40 text-sm mt-4">
                Loading verification...
              </Text>
            </View>
          )}
          {...(Platform.OS === 'android' && {
            androidLayerType: 'hardware',
            allowFileAccess: true,
          })}
        />
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Processing State
  // ─────────────────────────────────────────────────

  if (screenState === 'processing' || screenState === 'success') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        {screenState === 'processing' ? (
          <>
            <ActivityIndicator color="#f59e0b" size="large" />
            <Text className="text-white text-lg font-semibold mt-6 text-center">
              Verifying your identity...
            </Text>
            <Text className="text-white/40 text-sm mt-2 text-center">
              This may take a moment
            </Text>
          </>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u2705'}</Text>
            <Text className="text-white text-lg font-semibold mt-4 text-center">
              Age Verified!
            </Text>
            <Text className="text-white/40 text-sm mt-2 text-center">
              Proceeding to payment...
            </Text>
          </Animated.View>
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Loading Session
  // ─────────────────────────────────────────────────

  if (screenState === 'loading_session') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">
          Starting verification session...
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Failed State
  // ─────────────────────────────────────────────────

  if (screenState === 'failed') {
    const canRetry = attempts < MAX_ATTEMPTS;

    return (
      <View
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u274C'}</Text>
            <Text className="text-white text-xl font-bold mt-6 text-center">
              Verification Failed
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              {failureReason}
            </Text>
            {canRetry && (
              <Text className="text-white/30 text-sm mt-4 text-center">
                Attempt {attempts} of {MAX_ATTEMPTS}
              </Text>
            )}
          </Animated.View>
        </View>

        <View className="px-6">
          {canRetry ? (
            <Pressable
              onPress={startVerification}
              className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
            >
              <Text className="text-lg font-bold text-dark">Try Again</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.back()}
              className="w-full items-center justify-center rounded-2xl py-4 bg-dark-600 active:opacity-80"
            >
              <Text className="text-lg font-bold text-white">Go Back</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Explanation Screen (default)
  // ─────────────────────────────────────────────────

  return (
    <View
      className="flex-1 bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        className="px-6 pt-4 pb-2 self-start active:opacity-60"
        hitSlop={16}
      >
        <Text className="text-brand text-base">{'\u2190'} Back</Text>
      </Pressable>

      <View className="flex-1 px-6 justify-center">
        {/* Shield icon */}
        <Animated.View
          entering={FadeIn.duration(400)}
          className="items-center mb-8"
        >
          <View className="w-24 h-24 rounded-full bg-brand/15 items-center justify-center">
            <Text className="text-5xl">{'\uD83D\uDEE1\uFE0F'}</Text>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(100).duration(350)}>
          <Text className="text-2xl font-bold text-white text-center">
            Age Verification Required
          </Text>
          <Text className="text-base text-white/50 mt-3 text-center leading-6">
            We need to verify you&apos;re 21+ before you can purchase beer. This is a one-time process.
          </Text>
        </Animated.View>

        {/* What to expect */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(350)}
          className="mt-8 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-sm font-semibold text-white mb-3">
            What to expect:
          </Text>
          <View className="gap-2.5">
            <View className="flex-row items-center">
              <Text className="text-sm mr-3">{'\uD83D\uDCF7'}</Text>
              <Text className="text-sm text-white/60 flex-1">
                Take a photo of your government ID
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-sm mr-3">{'\uD83E\uDD33'}</Text>
              <Text className="text-sm text-white/60 flex-1">
                Take a quick selfie for verification
              </Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-sm mr-3">{'\u2705'}</Text>
              <Text className="text-sm text-white/60 flex-1">
                Complete a brief liveness check
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Privacy notice */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(350)}
          className="mt-4 px-2"
        >
          <Text className="text-xs text-white/30 text-center leading-5">
            Your ID is processed securely by Veriff and not stored by BeerBot
          </Text>
        </Animated.View>

        {/* Remember verification checkbox */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(350)}
          className="mt-6"
        >
          <Pressable
            onPress={() => setRememberVerification((prev) => !prev)}
            className="flex-row items-center justify-center gap-3 active:opacity-70"
          >
            <View
              className={`w-5 h-5 rounded border-2 items-center justify-center ${
                rememberVerification
                  ? 'bg-brand border-brand'
                  : 'border-white/30 bg-transparent'
              }`}
            >
              {rememberVerification && (
                <Text className="text-xs text-dark font-bold">{'\u2713'}</Text>
              )}
            </View>
            <Text className="text-sm text-white/60">
              Remember my verification
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* CTA Button */}
      <Animated.View
        entering={FadeIn.delay(500).duration(400)}
        className="px-6"
      >
        <Pressable
          onPress={startVerification}
          className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
        >
          <Text className="text-lg font-bold text-dark">Verify My Age</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
