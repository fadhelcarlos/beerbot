import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldX,
  Camera,
  User,
  CheckCircle2,
  X,
  Check,
} from 'lucide-react-native';
import {
  checkVerificationStatus,
  createVerificationSession,
} from '@/lib/api/verification';
import { subscribeTaps } from '@/lib/api/venues';
import { GlassCard, GoldButton, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
} from '@/lib/theme';
import type { Tap, TapWithBeer } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
// Gold Shimmer Loading
// ─────────────────────────────────────────────────

function GoldLoadingState({ message, subtitle }: { message: string; subtitle?: string }) {
  return (
    <View style={styles.centered}>
      <ShimmerLoader type="beer" count={1} />
      <View style={styles.loadingIconCircle}>
        <Shield size={28} color={colors.gold[400]} />
      </View>
      <Text style={[typography.heading, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
        {message}
      </Text>
      {subtitle && (
        <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
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
  const queryClient = useQueryClient();
  const inventoryChannelRef = useRef<RealtimeChannel | null>(null);

  // Monitor inventory changes via realtime subscription
  useEffect(() => {
    if (!venueId || !tapId) return;

    inventoryChannelRef.current = subscribeTaps(venueId, (updatedTap: Tap) => {
      if (updatedTap.id !== tapId) return;

      // Update the shared query cache
      queryClient.setQueryData<TapWithBeer[]>(
        ['venue-taps', venueId],
        (prev) => {
          if (!prev) return prev;
          return prev.map((t) => {
            if (t.id !== updatedTap.id) return t;
            const ozRemaining = updatedTap.oz_remaining;
            const lowThreshold = updatedTap.low_threshold_oz;
            let availabilityStatus: TapWithBeer['availability_status'] =
              'available';
            if (ozRemaining <= 0) availabilityStatus = 'out';
            else if (ozRemaining <= lowThreshold)
              availabilityStatus = 'low';

            return {
              ...t,
              ...updatedTap,
              beer: t.beer,
              price_12oz: t.price_12oz,
              availability_status: availabilityStatus,
            };
          });
        },
      );

      // Check if beer is no longer available for mobile ordering
      const ozRemaining = updatedTap.oz_remaining;
      const lowThreshold = updatedTap.low_threshold_oz;
      const isUnavailable = ozRemaining <= 0 || ozRemaining <= lowThreshold;

      if (isUnavailable && !hasNavigated.current) {
        hasNavigated.current = true;
        Alert.alert(
          'Beer Unavailable',
          'This beer is no longer available for mobile ordering.',
          [{
            text: 'OK',
            onPress: () => router.replace(`/(main)/venues/${venueId}` as `/(main)/venues/${string}`),
          }],
        );
      }
    });

    return () => {
      inventoryChannelRef.current?.unsubscribe();
      inventoryChannelRef.current = null;
    };
  }, [venueId, tapId, queryClient, router]);

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

      if (message.includes('already verified')) {
        // Race condition: user got verified between check and start
        hasNavigated.current = true;
        router.replace({
          pathname: '/(main)/order/payment',
          params: orderParams,
        });
      } else {
        // Show user-friendly error with a failure screen instead of raw Alert
        setFailureReason(message);
        setScreenState('failed');
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
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <GoldLoadingState message="Checking verification status..." />
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Veriff WebView
  // ─────────────────────────────────────────────────

  if (screenState === 'verifying' && sessionUrl) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header with cancel */}
        <View style={styles.webviewHeader}>
          <Text style={[typography.heading, { color: colors.text.primary }]}>
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
            style={styles.cancelButton}
          >
            <X size={20} color={colors.gold[400]} />
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
            <View style={[StyleSheet.absoluteFill, styles.screen, styles.screenCentered]}>
              <GoldLoadingState message="Loading verification..." />
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
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        {screenState === 'processing' ? (
          <GoldLoadingState
            message="Verifying your identity..."
            subtitle="This may take a moment"
          />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
            <View style={styles.successIconCircle}>
              <Image
                source={require('@/assets/verify_icon.png')}
                style={{ width: 48, height: 48 }}
                resizeMode="contain"
              />
            </View>
            <Text style={[typography.heading, { color: colors.text.primary, textAlign: 'center', marginTop: 16 }]}>
              Age Verified!
            </Text>
            <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
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
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <GoldLoadingState message="Starting verification session..." />
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
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.failedContent}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
            <View style={styles.failedIconCircle}>
              <ShieldX size={36} color={colors.status.danger} />
            </View>
            <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
              Verification Failed
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
              {failureReason}
            </Text>
            {canRetry && (
              <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 16 }]}>
                Attempt {attempts} of {MAX_ATTEMPTS}
              </Text>
            )}
          </Animated.View>
        </View>

        <View style={styles.ctaSection}>
          {canRetry ? (
            <GoldButton label="Try Again" onPress={startVerification} />
          ) : (
            <GoldButton label="Go Back" variant="ghost" onPress={() => router.back()} />
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
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
    >
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={16}
      >
        <View style={styles.backButtonCircle}>
          <ArrowLeft size={20} color={colors.text.primary} />
        </View>
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.explanationContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Shield icon */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={styles.centeredContent}
        >
          <View style={styles.shieldIconCircle}>
            <Image
              source={require('@/assets/verify_icon.png')}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(100).duration(350)}>
          <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center' }]}>
            Age Verification Required
          </Text>
          <Text style={[typography.body, { color: colors.text.secondary, marginTop: 12, textAlign: 'center', lineHeight: 24 }]}>
            We need to verify you&apos;re 21+ before you can purchase beer. This is a one-time process.
          </Text>
        </Animated.View>

        {/* What to expect */}
        <Animated.View entering={FadeInDown.delay(200).duration(350)}>
          <GlassCard style={styles.expectCard}>
            <Text style={[typography.label, { color: colors.text.primary, marginBottom: 16 }]}>
              What to expect:
            </Text>
            <View style={styles.expectList}>
              <View style={styles.expectItem}>
                <View style={styles.expectIconCircle}>
                  <Camera size={16} color={colors.gold[400]} />
                </View>
                <Text style={[typography.body, { color: colors.text.secondary, flex: 1, fontSize: 14 }]}>
                  Take a photo of your government ID
                </Text>
              </View>
              <View style={styles.expectItem}>
                <View style={styles.expectIconCircle}>
                  <User size={16} color={colors.gold[400]} />
                </View>
                <Text style={[typography.body, { color: colors.text.secondary, flex: 1, fontSize: 14 }]}>
                  Take a quick selfie for verification
                </Text>
              </View>
              <View style={styles.expectItem}>
                <View style={styles.expectIconCircle}>
                  <CheckCircle2 size={16} color={colors.gold[400]} />
                </View>
                <Text style={[typography.body, { color: colors.text.secondary, flex: 1, fontSize: 14 }]}>
                  Complete a brief liveness check
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Privacy notice */}
        <Animated.View entering={FadeInDown.delay(300).duration(350)}>
          <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 16, lineHeight: 18 }]}>
            Your ID is processed securely by Veriff and not stored by BeerBot
          </Text>
        </Animated.View>

        {/* Remember verification checkbox */}
        <Animated.View entering={FadeInDown.delay(400).duration(350)}>
          <Pressable
            onPress={() => setRememberVerification((prev) => !prev)}
            style={styles.checkboxRow}
          >
            <View
              style={[
                styles.checkbox,
                rememberVerification && styles.checkboxChecked,
              ]}
            >
              {rememberVerification && (
                <Check size={12} color={colors.bg.primary} strokeWidth={3} />
              )}
            </View>
            <Text style={[typography.label, { color: colors.text.secondary }]}>
              Remember my verification
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* CTA Button */}
      <Animated.View
        entering={FadeIn.delay(500).duration(400)}
        style={styles.ctaSection}
      >
        <GoldButton label="Verify My Age" onPress={startVerification} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  screenCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  centered: {
    alignItems: 'center',
  },
  centeredContent: {
    alignItems: 'center',
  },
  backButton: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 8,
    alignSelf: 'flex-start',
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glass.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200,162,77,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,162,77,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glowSubtle,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.status.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldIconCircle: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  explanationContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenPadding,
    justifyContent: 'center',
    paddingBottom: 16,
  },
  expectCard: {
    marginTop: spacing.sectionGap,
  },
  expectList: {
    gap: 12,
  },
  expectItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expectIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(200,162,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 24,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.text.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.gold[500],
    borderColor: colors.gold[500],
  },
  ctaSection: {
    paddingHorizontal: spacing.screenPadding,
  },
  failedContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  webviewHeader: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.glass.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
