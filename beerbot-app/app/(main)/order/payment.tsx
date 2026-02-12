import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import {
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle,
} from 'lucide-react-native';
import { fetchVenueTaps, subscribeTaps } from '@/lib/api/venues';
import { createOrder, getOrder } from '@/lib/api/orders';
import {
  initializePaymentSheet,
  presentPayment,
} from '@/lib/api/payments';
import { supabase } from '@/lib/supabase';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import { getBeerImageUrl } from '@/lib/utils/images';
import { GlassCard, GoldButton, PremiumBadge, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  springs,
} from '@/lib/theme';
import type { Order, Tap, TapWithBeer } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PaymentState =
  | 'loading'
  | 'ready'
  | 'processing'
  | 'success'
  | 'failed'
  | 'checking_status'
  | 'error';

// ─────────────────────────────────────────────────
// Gold Loading State
// ─────────────────────────────────────────────────

function GoldLoadingState({ message, subtitle }: { message: string; subtitle?: string }) {
  return (
    <View style={loadingStyles.container}>
      <View style={loadingStyles.iconCircle}>
        <CreditCard size={28} color={colors.gold[400]} />
      </View>
      <ShimmerLoader type="beer" count={1} />
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

const loadingStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200,162,77,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,162,77,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadows.glowSubtle,
  },
});

// ─────────────────────────────────────────────────
// Animated Back Button
// ─────────────────────────────────────────────────

function AnimatedBackButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, springs.button);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.button);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[animatedStyle, styles.backButton]}
      hitSlop={16}
    >
      <View style={styles.backButtonCircle}>
        <ArrowLeft size={20} color={colors.text.primary} />
      </View>
    </AnimatedPressable>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function PaymentScreen() {
  const { tapId, venueId, quantity, totalPrice } = useLocalSearchParams<{
    tapId: string;
    venueId: string;
    quantity: string;
    totalPrice: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paymentState, setPaymentState] = useState<PaymentState>('loading');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const hasNavigated = useRef(false);
  const isPayingRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inventoryChannelRef = useRef<RealtimeChannel | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const qty = Number(quantity ?? '1');
  const displayTotal = totalPrice ?? '0.00';

  // Monitor inventory changes — alert if beer becomes unavailable before payment
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
        cleanupPolling();
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

  // Fetch tap data for order summary display
  const tapsQuery = useQuery({
    queryKey: ['venue-taps', venueId],
    queryFn: () => fetchVenueTaps(venueId!),
    enabled: !!venueId,
    staleTime: 1000 * 60,
  });

  const tap = useMemo(
    () => tapsQuery.data?.find((t: TapWithBeer) => t.id === tapId) ?? null,
    [tapsQuery.data, tapId],
  );

  const beer = tap?.beer ?? null;
  const unitPrice = tap?.price_12oz ?? 0;

  // ─────────────────────────────────────────────────
  // Create order + initialize payment on mount
  // ─────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // Step 1: Create the order atomically
        const orderResponse = await createOrder({
          tap_id: tapId!,
          quantity: qty,
        });

        if (cancelled) return;

        setOrderId(orderResponse.order_id);
        setServerAmount(orderResponse.total_amount);

        // Step 2: Initialize Stripe Payment Sheet with the order
        await initializePaymentSheet(orderResponse.order_id);

        if (cancelled) return;

        setPaymentState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(formatErrorMessage(err));
        setPaymentState('error');
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, [tapId, qty]);

  // ─────────────────────────────────────────────────
  // Realtime subscription for order status changes
  // ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as Order;

          if (
            updatedOrder.status === 'paid' ||
            updatedOrder.status === 'ready_to_redeem'
          ) {
            // Payment confirmed via webhook — navigate to QR
            if (!hasNavigated.current) {
              hasNavigated.current = true;
              cleanupPolling();
              setPaymentState('success');

              // Brief celebration moment then navigate
              setTimeout(() => {
                router.replace({
                  pathname: '/(main)/order/redeem',
                  params: { orderId: updatedOrder.id },
                });
              }, 1500);
            }
          } else if (updatedOrder.status === 'cancelled') {
            setErrorMessage('Payment declined');
            setPaymentState('failed');
            cleanupPolling();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      realtimeChannelRef.current = null;
    };
  }, [orderId, router]);

  // ─────────────────────────────────────────────────
  // Polling fallback for network issues
  // ─────────────────────────────────────────────────

  const startStatusPolling = useCallback(() => {
    if (!orderId || statusPollRef.current) return;

    setPaymentState('checking_status');

    statusPollRef.current = setInterval(async () => {
      try {
        const order = await getOrder(orderId);
        if (
          order.status === 'paid' ||
          order.status === 'ready_to_redeem'
        ) {
          if (!hasNavigated.current) {
            hasNavigated.current = true;
            cleanupPolling();
            setPaymentState('success');
            setTimeout(() => {
              router.replace({
                pathname: '/(main)/order/redeem',
                params: { orderId: order.id },
              });
            }, 1500);
          }
        } else if (
          order.status === 'cancelled' ||
          order.status === 'expired'
        ) {
          cleanupPolling();
          setErrorMessage('Payment was not completed');
          setPaymentState('failed');
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    // Stop polling after 30s
    pollingTimeoutRef.current = setTimeout(() => {
      if (statusPollRef.current) {
        cleanupPolling();
        if (paymentState === 'checking_status') {
          setErrorMessage(
            'Could not confirm payment status. Please check your order history.',
          );
          setPaymentState('failed');
        }
      }
    }, 30000);
  }, [orderId, router, paymentState]);

  function cleanupPolling() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    if (payFallbackTimeoutRef.current) {
      clearTimeout(payFallbackTimeoutRef.current);
      payFallbackTimeoutRef.current = null;
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => cleanupPolling();
  }, []);

  // ─────────────────────────────────────────────────
  // Network drop detection
  // ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasProcessing =
        paymentState === 'processing' || paymentState === 'checking_status';
      if (
        state.isConnected === false &&
        wasProcessing &&
        !statusPollRef.current
      ) {
        setPaymentState('checking_status');
      }

      if (
        state.isConnected &&
        paymentState === 'checking_status' &&
        !statusPollRef.current &&
        !hasNavigated.current
      ) {
        startStatusPolling();
      }
    });

    return () => unsubscribe();
  }, [orderId, paymentState, startStatusPolling]);

  // ─────────────────────────────────────────────────
  // Handle Pay Button
  // ─────────────────────────────────────────────────

  const handlePay = useCallback(async () => {
    // Idempotency: prevent double-tap
    if (isPayingRef.current) return;
    isPayingRef.current = true;

    setPaymentState('processing');

    try {
      const success = await presentPayment();

      if (!success) {
        // User cancelled the payment sheet
        isPayingRef.current = false;
        setPaymentState('ready');
        return;
      }

      // Payment sheet completed — wait for webhook confirmation via realtime
      payFallbackTimeoutRef.current = setTimeout(() => {
        if (!hasNavigated.current && paymentState !== 'success') {
          startStatusPolling();
        }
      }, 5000);
    } catch (err) {
      isPayingRef.current = false;
      setErrorMessage(formatErrorMessage(err));
      setPaymentState('failed');
    }
  }, [paymentState, startStatusPolling]);

  // ─────────────────────────────────────────────────
  // Retry after failure
  // ─────────────────────────────────────────────────

  const handleRetry = useCallback(async () => {
    if (!orderId) return;
    isPayingRef.current = false;
    hasNavigated.current = false;
    setErrorMessage('');

    try {
      setPaymentState('loading');
      // Re-initialize payment sheet (uses idempotent PaymentIntent)
      await initializePaymentSheet(orderId);
      setPaymentState('ready');
    } catch (err) {
      setErrorMessage(formatErrorMessage(err));
      setPaymentState('error');
    }
  }, [orderId]);

  // ─────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────

  if (paymentState === 'loading') {
    return (
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <GoldLoadingState message="Setting up payment..." />
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Processing State
  // ─────────────────────────────────────────────────

  if (paymentState === 'processing') {
    return (
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <GoldLoadingState
          message="Processing payment..."
          subtitle="Please do not close the app"
        />
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Checking Status State (network fallback)
  // ─────────────────────────────────────────────────

  if (paymentState === 'checking_status') {
    return (
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <GoldLoadingState
          message="Checking payment status..."
          subtitle="This may take a moment"
        />
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Success State
  // ─────────────────────────────────────────────────

  if (paymentState === 'success') {
    return (
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
          <View style={styles.successIconCircle}>
            <CheckCircle size={36} color={colors.gold[400]} />
          </View>
          <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
            Payment Successful!
          </Text>
          <PremiumBadge label="CONFIRMED" variant="success" glow small />
          <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: 12 }]}>
            Getting your QR code ready...
          </Text>
        </Animated.View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Setup Error State (order creation failed)
  // ─────────────────────────────────────────────────

  if (paymentState === 'error') {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.errorContent}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
            <View style={styles.errorIconCircle}>
              <AlertTriangle size={36} color={colors.status.warning} />
            </View>
            <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
              Something went wrong
            </Text>
            <PremiumBadge label="ERROR" variant="warning" small />
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
              {errorMessage}
            </Text>
          </Animated.View>
        </View>
        <View style={styles.ctaSection}>
          <GoldButton label="Go Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Payment Failed State
  // ─────────────────────────────────────────────────

  if (paymentState === 'failed') {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.errorContent}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
            <View style={styles.failedIconCircle}>
              <XCircle size={36} color={colors.status.danger} />
            </View>
            <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
              Payment Failed
            </Text>
            <PremiumBadge label="DECLINED" variant="danger" small />
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
              {errorMessage || 'Payment declined'}
            </Text>
          </Animated.View>
        </View>
        <View style={[styles.ctaSection, { gap: 12 }]}>
          <GoldButton label="Try Again" onPress={handleRetry} />
          <GoldButton label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Ready State (main payment screen)
  // ─────────────────────────────────────────────────

  const amount = serverAmount ?? Number(displayTotal);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button with scale press animation */}
        <AnimatedBackButton
          onPress={() => {
            Alert.alert(
              'Cancel Payment?',
              'Your order will be cancelled.',
              [
                { text: 'Stay', style: 'cancel' },
                {
                  text: 'Cancel Order',
                  style: 'destructive',
                  onPress: () => router.back(),
                },
              ],
            );
          }}
        />

        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(350)}
          style={styles.section}
        >
          <Text style={[typography.title, { color: colors.text.primary }]}>
            Confirm & Pay
          </Text>
        </Animated.View>

        {/* Order Summary Card */}
        <Animated.View entering={FadeInDown.delay(150).duration(350)}>
          <GlassCard goldAccent style={styles.sectionCard}>
            <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 16 }]}>
              Order Summary
            </Text>

            {/* Beer info */}
            <View style={styles.beerInfoRow}>
              <View style={styles.beerThumbnail}>
                <Image
                  source={{ uri: getBeerImageUrl(beer?.style, beer?.image_url) }}
                  style={styles.beerThumbnailImage}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyMedium, { color: colors.text.primary }]}>
                  {beer?.name ?? 'Beer'}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                  {beer?.style ?? ''} {beer?.abv ? `${'\u00B7'} ${beer.abv}% ABV` : ''}
                </Text>
              </View>
            </View>

            {/* Assigned tap */}
            {tap && (
              <View style={styles.tapRow}>
                <PremiumBadge label={`Tap #${tap.tap_number}`} variant="gold" />
              </View>
            )}

            {/* Price breakdown */}
            <View style={styles.goldDivider} />
            <View style={styles.priceRow}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Unit price</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                ${unitPrice.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.priceRow, { marginTop: 8 }]}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Quantity</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                {'\u00D7'} {qty}
              </Text>
            </View>
            <View style={styles.goldDivider} />
            <View style={styles.priceRow}>
              <Text style={[typography.bodyMedium, { color: colors.text.primary }]}>Total</Text>
              <Text style={[typography.title, { color: colors.gold[400] }]}>
                ${amount.toFixed(2)}
              </Text>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Payment Methods Info */}
        <Animated.View entering={FadeInDown.delay(250).duration(350)}>
          <GlassCard style={styles.sectionCard}>
            <View style={styles.paymentMethodHeader}>
              <CreditCard size={18} color={colors.gold[400]} />
              <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 8 }]}>
                Payment Method
              </Text>
            </View>
            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 12, fontSize: 14, lineHeight: 22 }]}>
              Apple Pay, Google Pay, and card payments are available. Tap the
              button below to choose your preferred method.
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Security notice */}
        <Animated.View
          entering={FadeInDown.delay(350).duration(350)}
          style={[styles.section, { marginTop: 16 }]}
        >
          <View style={styles.securityRow}>
            <ShieldCheck size={14} color={colors.gold[500]} />
            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6, lineHeight: 18 }]}>
              Payments are processed securely by Stripe
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Fixed CTA button at bottom */}
      <Animated.View
        entering={FadeIn.delay(400).duration(400)}
        style={[styles.ctaContainer, { paddingBottom: insets.bottom + 12 }]}
      >
        <GoldButton
          label={`Pay $${amount.toFixed(2)}`}
          onPress={handlePay}
        />
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
  section: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 16,
  },
  sectionCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sectionGap,
  },
  beerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  beerThumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: colors.glass.surface,
  },
  beerThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  tapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goldDivider: {
    height: 1,
    backgroundColor: 'rgba(200,162,77,0.15)',
    marginVertical: 16,
  },
  paymentMethodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: colors.glass.border,
  },
  ctaSection: {
    paddingHorizontal: spacing.screenPadding,
  },
  errorContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(200,162,77,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadows.glow,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.status.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  failedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.status.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
