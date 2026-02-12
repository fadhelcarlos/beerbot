import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
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
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import LottieView from 'lottie-react-native';
import {
  Check,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react-native';
import { getOrder } from '@/lib/api/orders';
import { generateQrToken, generateQrDataString } from '@/lib/utils/qr';
import { fetchVenue } from '@/lib/api/venues';
import { supabase } from '@/lib/supabase';
import {
  scheduleRedemptionWarnings,
  cancelScheduledNotification,
} from '@/lib/notifications';
import { GlassCard, GoldButton, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  springs,
  goldGradient,
} from '@/lib/theme';
import type { Order, OrderStatus } from '@/types/api';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

type ScreenState = 'loading' | 'ready' | 'pouring' | 'completed' | 'expired' | 'error';

// Status stepper steps — the visual pipeline
const ORDER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'ready_to_redeem', label: 'Ready' },
  { key: 'redeemed', label: 'Scanned' },
  { key: 'pouring', label: 'Pouring' },
  { key: 'completed', label: 'Complete' },
];

function getStepIndex(status: OrderStatus): number {
  const idx = ORDER_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

// ─────────────────────────────────────────────────
// Countdown Timer Hook
// ─────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Always clear any existing interval first (handles expiresAt changing)
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!expiresAt) {
      setRemaining(null);
      return;
    }

    function calcRemaining() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      return Math.max(0, Math.floor(diff / 1000));
    }

    setRemaining(calcRemaining());

    intervalRef.current = setInterval(() => {
      const secs = calcRemaining();
      setRemaining(secs);
      if (secs <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [expiresAt]);

  return remaining;
}

function formatCountdown(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────
// Status Stepper Component (Gold Gradient Design)
// ─────────────────────────────────────────────────

function StatusStepper({ currentStatus }: { currentStatus: OrderStatus }) {
  const currentIndex = getStepIndex(currentStatus);
  const glowPulse = useSharedValue(1);

  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [glowPulse]);

  const currentGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
  }));

  return (
    <View style={stepperStyles.container}>
      {ORDER_STEPS.map((step, i) => {
        const isActive = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === ORDER_STEPS.length - 1;
        const isCompleted = i < currentIndex;

        return (
          <View key={step.key} style={stepperStyles.stepWrapper}>
            {/* Step circle */}
            <View style={stepperStyles.stepColumn}>
              {isCurrent ? (
                <Animated.View style={currentGlowStyle}>
                  <LinearGradient
                    colors={goldGradient.colors as unknown as [string, string, ...string[]]}
                    start={goldGradient.start}
                    end={goldGradient.end}
                    style={[stepperStyles.stepCircle, shadows.glowSubtle]}
                  >
                    <Check size={14} color={colors.bg.primary} strokeWidth={3} />
                  </LinearGradient>
                </Animated.View>
              ) : isCompleted ? (
                <LinearGradient
                  colors={['rgba(200,162,77,0.6)', 'rgba(200,162,77,0.4)'] as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={stepperStyles.stepCircle}
                >
                  <Check size={14} color={colors.bg.primary} strokeWidth={3} />
                </LinearGradient>
              ) : (
                <View style={stepperStyles.stepCircleInactive}>
                  <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                    {i + 1}
                  </Text>
                </View>
              )}
              <Text
                style={[
                  typography.overline,
                  {
                    color: isCurrent
                      ? colors.gold[400]
                      : isActive
                        ? colors.text.secondary
                        : colors.text.tertiary,
                    marginTop: 4,
                    textAlign: 'center',
                    fontSize: 9,
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector line */}
            {!isLast && (
              <View style={stepperStyles.connectorContainer}>
                {i < currentIndex ? (
                  <LinearGradient
                    colors={['rgba(200,162,77,0.6)', 'rgba(200,162,77,0.3)'] as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={stepperStyles.connector}
                  />
                ) : (
                  <View style={stepperStyles.connectorInactive} />
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  stepWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  stepColumn: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleInactive: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.glass.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: 16,
  },
  connector: {
    height: 2,
    borderRadius: 1,
  },
  connectorInactive: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.glass.border,
  },
});

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function RedeemScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Keep screen awake while on this screen
  useKeepAwake();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [order, setOrder] = useState<Order | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [tapNumber, setTapNumber] = useState<number | null>(null);
  const [beerName, setBeerName] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [qrTimedOut, setQrTimedOut] = useState(false);

  const originalBrightness = useRef<number | null>(null);
  const previousStatusRef = useRef<OrderStatus | null>(null);
  const lottieRef = useRef<LottieView>(null);
  const notifFiveMinRef = useRef<string | null>(null);
  const notifOneMinRef = useRef<string | null>(null);

  const remaining = useCountdown(order?.expires_at ?? null);

  // Animated values
  const stepperPulse = useSharedValue(1);
  const qrBreathScale = useSharedValue(1);
  const countdownPulse = useSharedValue(1);

  const stepperPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stepperPulse.value }],
  }));

  // QR breathing animation
  const qrBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qrBreathScale.value }],
  }));

  useEffect(() => {
    qrBreathScale.value = withRepeat(
      withSequence(
        withTiming(1.01, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [qrBreathScale]);

  // Countdown pulse animation when critical
  const countdownPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownPulse.value }],
  }));

  useEffect(() => {
    const isCritical = remaining != null && remaining <= 60;
    if (isCritical) {
      countdownPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 500 }),
          withTiming(1.0, { duration: 500 }),
        ),
        -1,
        false,
      );
    } else {
      countdownPulse.value = withTiming(1, { duration: 300 });
    }
  }, [remaining, countdownPulse]);

  // Trigger haptic feedback on status change
  const triggerHaptic = useCallback(async (status: OrderStatus) => {
    try {
      if (status === 'completed') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (status === 'expired') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      // Haptics may not be available in simulator
    }
  }, []);

  // Cancel any pending redemption warning notifications
  const cancelRedemptionNotifications = useCallback(async () => {
    if (notifFiveMinRef.current) {
      await cancelScheduledNotification(notifFiveMinRef.current);
      notifFiveMinRef.current = null;
    }
    if (notifOneMinRef.current) {
      await cancelScheduledNotification(notifOneMinRef.current);
      notifOneMinRef.current = null;
    }
  }, []);

  // Handle order status transitions
  const handleStatusChange = useCallback(
    (newStatus: OrderStatus) => {
      if (previousStatusRef.current === newStatus) return;
      previousStatusRef.current = newStatus;

      // Trigger haptic
      triggerHaptic(newStatus);

      // Pulse the stepper
      stepperPulse.value = withSequence(
        withSpring(1.05, { damping: 8 }),
        withSpring(1, { damping: 12 }),
      );

      // Cancel notifications when order is redeemed or transitions past ready state
      if (
        newStatus === 'redeemed' ||
        newStatus === 'pouring' ||
        newStatus === 'completed' ||
        newStatus === 'expired'
      ) {
        cancelRedemptionNotifications();
      }

      // Transition screen state
      if (newStatus === 'pouring') {
        setScreenState('pouring');
      } else if (newStatus === 'completed') {
        setScreenState('completed');
      } else if (newStatus === 'expired') {
        setScreenState('expired');
      }
    },
    [triggerHaptic, stepperPulse, cancelRedemptionNotifications],
  );

  // Auto-maximize screen brightness on mount, restore on unmount
  useEffect(() => {
    let mounted = true;

    async function maxBrightness() {
      try {
        const current = await Brightness.getBrightnessAsync();
        if (mounted) originalBrightness.current = current;
        await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness API may not be available in simulator
      }
    }

    maxBrightness();

    return () => {
      mounted = false;
      if (originalBrightness.current != null) {
        Brightness.setBrightnessAsync(originalBrightness.current).catch(
          () => {},
        );
      }
    };
  }, []);

  // QR generation timeout — if QR data isn't ready within 15s, show error
  useEffect(() => {
    if (qrData || screenState !== 'loading') return;
    const timeout = setTimeout(() => {
      if (!qrData) setQrTimedOut(true);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [qrData, screenState]);

  // Load order data, generate QR token, fetch enrichment data
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function load() {
      try {
        // Step 1: Fetch order
        const orderData = await getOrder(orderId!);
        if (cancelled) return;
        setOrder(orderData);
        setVenueId(orderData.venue_id);
        previousStatusRef.current = orderData.status;

        // Determine initial screen state from existing order status
        if (orderData.status === 'pouring') {
          setScreenState('pouring');
        } else if (orderData.status === 'completed') {
          setScreenState('completed');
        } else if (orderData.status === 'expired') {
          setScreenState('expired');
        }

        // Step 2: Ensure QR token exists
        let token = orderData.qr_code_token;
        if (!token) {
          const tokenResp = await generateQrToken(orderId!);
          if (cancelled) return;
          token = tokenResp.qr_token;
        }

        // Step 3: Generate QR data string
        const qrString = generateQrDataString(token);
        if (cancelled) return;
        setQrData(qrString);

        // Step 4: Fetch tap number
        const { data: tapData } = await supabase
          .from('taps')
          .select('tap_number')
          .eq('id', orderData.tap_id)
          .single();
        if (cancelled) return;
        if (tapData) setTapNumber(tapData.tap_number);

        // Step 5: Fetch beer name
        const { data: beerData } = await supabase
          .from('beers')
          .select('name')
          .eq('id', orderData.beer_id)
          .single();
        if (cancelled) return;
        if (beerData) setBeerName(beerData.name);

        // Step 6: Fetch venue name
        const venueData = await fetchVenue(orderData.venue_id);
        if (cancelled) return;
        if (venueData) setVenueName(venueData.name);

        // Only set to 'ready' if not already in a terminal/pouring state
        if (
          orderData.status !== 'pouring' &&
          orderData.status !== 'completed' &&
          orderData.status !== 'expired'
        ) {
          setScreenState('ready');

          // Schedule redemption warning notifications if order has an expiry
          if (orderData.expires_at) {
            scheduleRedemptionWarnings(orderData.expires_at, orderId!).then(
              ({ fiveMinId, oneMinId }) => {
                if (!cancelled) {
                  notifFiveMinRef.current = fiveMinId;
                  notifOneMinRef.current = oneMinId;
                }
              },
            );
          }
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to load order',
        );
        setScreenState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Subscribe to realtime order status changes
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-status-${orderId}`)
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
          setOrder(updatedOrder);
          handleStatusChange(updatedOrder.status);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, handleStatusChange]);

  // Watch for timer-based expiration
  useEffect(() => {
    if (remaining === 0 && screenState === 'ready') {
      setScreenState('expired');
      triggerHaptic('expired');
      cancelRedemptionNotifications();
    }
  }, [remaining, screenState, triggerHaptic, cancelRedemptionNotifications]);

  // Cancel scheduled notifications on unmount
  useEffect(() => {
    return () => {
      if (notifFiveMinRef.current) {
        cancelScheduledNotification(notifFiveMinRef.current);
      }
      if (notifOneMinRef.current) {
        cancelScheduledNotification(notifOneMinRef.current);
      }
    };
  }, []);

  const handleDone = useCallback(() => {
    if (venueId) {
      router.replace(`/(main)/venues/${venueId}` as `/(main)/venues/${string}`);
    } else {
      router.replace('/(main)/venues');
    }
  }, [router, venueId]);

  const handleBackToVenues = useCallback(() => {
    router.replace('/(main)/venues');
  }, [router]);

  // ─────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────

  if (screenState === 'loading') {
    return (
      <View style={[styles.screen, styles.screenCentered, { paddingTop: insets.top }]}>
        <ShimmerLoader type="order" count={2} />
        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 16 }]}>
          Preparing your QR code...
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Error State
  // ─────────────────────────────────────────────────

  if (screenState === 'error') {
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
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
              {errorMessage}
            </Text>
          </Animated.View>
        </View>
        <View style={styles.ctaSection}>
          <GoldButton label="Back to Venues" variant="ghost" onPress={handleBackToVenues} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Expired State
  // ─────────────────────────────────────────────────

  if (screenState === 'expired') {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.errorContent}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredContent}>
            <View style={styles.expiredIconCircle}>
              <Clock size={36} color={colors.text.secondary} />
            </View>
            <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center', marginTop: 20 }]}>
              Order Expired
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12, lineHeight: 24 }]}>
              Your redemption window has closed.
            </Text>
            <GlassCard goldAccent style={{ marginTop: 20 }}>
              <Text style={[typography.label, { color: colors.status.success, textAlign: 'center' }]}>
                You have not been charged
              </Text>
              <Text style={[typography.caption, { color: 'rgba(52,211,153,0.6)', textAlign: 'center', marginTop: 4 }]}>
                A full refund will be processed automatically
              </Text>
            </GlassCard>
          </Animated.View>
        </View>
        <View style={styles.ctaSection}>
          <GoldButton label="Order Again" onPress={handleBackToVenues} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Pouring State
  // ─────────────────────────────────────────────────

  if (screenState === 'pouring') {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        {/* Status Stepper */}
        <Animated.View
          style={[stepperPulseStyle, { marginHorizontal: spacing.screenPadding, marginTop: 24 }]}
        >
          <StatusStepper currentStatus={order?.status ?? 'pouring'} />
        </Animated.View>

        <View style={styles.pouringContent}>
          <Animated.View entering={FadeIn.duration(600)} style={styles.centeredContent}>
            {/* Gold radial glow behind the Lottie */}
            <View style={styles.pouringGlow} />
            <View style={styles.lottieContainer}>
              <LottieView
                ref={lottieRef}
                source={require('@/assets/pouring-animation.json')}
                autoPlay
                loop
                style={{ width: '100%', height: '100%' }}
              />
            </View>
            <Animated.Text
              entering={FadeInUp.delay(200).duration(400)}
              style={[typography.title, { color: colors.gold[400], marginTop: 16, textAlign: 'center' }]}
            >
              Pouring your beer...
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(400).duration(400)}
              style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center' }]}
            >
              {beerName ?? 'Your beer'} from Tap #{tapNumber ?? '?'}
            </Animated.Text>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Completed State
  // ─────────────────────────────────────────────────

  if (screenState === 'completed') {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}
      >
        {/* Status Stepper */}
        <Animated.View
          style={[stepperPulseStyle, { marginHorizontal: spacing.screenPadding, marginTop: 24 }]}
        >
          <StatusStepper currentStatus="completed" />
        </Animated.View>

        <View style={styles.pouringContent}>
          <Animated.View entering={FadeIn.duration(600)} style={styles.centeredContent}>
            <View style={styles.celebrationLottie}>
              <LottieView
                source={require('@/assets/celebration-animation.json')}
                autoPlay
                loop={false}
                style={{ width: '100%', height: '100%' }}
              />
            </View>
            <Animated.Text
              entering={FadeInUp.delay(200).duration(400)}
              style={[typography.display, { color: colors.gold[400], marginTop: 16, textAlign: 'center' }]}
            >
              Enjoy your beer!
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(400).duration(400)}
              style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center' }]}
            >
              {beerName ?? 'Your beer'} is ready. Cheers!
            </Animated.Text>
          </Animated.View>
        </View>

        {/* Done button */}
        <View style={styles.ctaSection}>
          <GoldButton label="Done" onPress={handleDone} />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Ready State (main QR screen with stepper)
  // ─────────────────────────────────────────────────

  const isWarning = remaining != null && remaining <= 300 && remaining > 60;
  const isCritical = remaining != null && remaining <= 60;

  const countdownColor = isCritical
    ? colors.status.danger
    : isWarning
      ? colors.status.warning
      : colors.gold[400];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Stepper */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(350)}
          style={[stepperPulseStyle, { marginHorizontal: spacing.screenPadding, marginTop: 24 }]}
        >
          <StatusStepper currentStatus={order?.status ?? 'ready_to_redeem'} />
        </Animated.View>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(350)}
          style={styles.headerSection}
        >
          <Text style={[typography.title, { color: colors.text.primary, textAlign: 'center' }]}>
            Your Beer is Ready!
          </Text>
        </Animated.View>

        {/* QR Code with Gold Gradient Frame */}
        <Animated.View
          entering={FadeIn.delay(250).duration(500)}
          style={styles.qrSection}
        >
          <Animated.View style={qrBreathStyle}>
            <LinearGradient
              colors={goldGradient.colors as unknown as [string, string, ...string[]]}
              start={goldGradient.start}
              end={goldGradient.end}
              style={[styles.qrGradientFrame, shadows.glow]}
            >
              <View style={styles.qrWhiteArea}>
                {qrData ? (
                  <QRCode value={qrData} size={220} />
                ) : qrTimedOut ? (
                  <View style={styles.qrErrorContainer}>
                    <AlertTriangle size={24} color={colors.status.danger} />
                    <Text style={[typography.label, { color: colors.status.danger, textAlign: 'center', marginTop: 8 }]}>
                      Failed to generate QR code
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginTop: 4 }]}>
                      Please go back and try again
                    </Text>
                  </View>
                ) : (
                  <View style={styles.qrLoadingContainer}>
                    <ShimmerLoader type="beer" count={1} />
                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8 }]}>
                      Generating QR code...
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* Go to Tap instruction */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(350)}
          style={styles.headerSection}
        >
          <Text style={[typography.display, { color: colors.gold[400], textAlign: 'center' }]}>
            Go to Tap #{tapNumber ?? '?'}
          </Text>
        </Animated.View>

        {/* Step-by-step instructions */}
        <Animated.View entering={FadeInDown.delay(500).duration(350)}>
          <GlassCard style={styles.instructionsCard}>
            {[
              `Walk to Tap #${tapNumber ?? '?'}`,
              'Scan this code',
              'Enjoy your beer!',
            ].map((text, i) => (
              <View key={i} style={[styles.instructionRow, i > 0 && { marginTop: 12 }]}>
                <LinearGradient
                  colors={goldGradient.colors as unknown as [string, string, ...string[]]}
                  start={goldGradient.start}
                  end={goldGradient.end}
                  style={styles.instructionCircle}
                >
                  <Text style={[typography.caption, { color: colors.bg.primary, fontWeight: '700' }]}>
                    {i + 1}
                  </Text>
                </LinearGradient>
                <Text style={[typography.body, { color: colors.text.primary, flex: 1, marginLeft: 12 }]}>
                  {text}
                </Text>
              </View>
            ))}
          </GlassCard>
        </Animated.View>

        {/* Countdown Timer */}
        <Animated.View
          entering={FadeInDown.delay(600).duration(350)}
          style={styles.countdownSection}
        >
          <Text style={[typography.overline, { color: colors.text.secondary, marginBottom: 8 }]}>
            Time remaining
          </Text>
          <Animated.View style={countdownPulseStyle}>
            <Text
              style={[
                typography.display,
                { color: countdownColor, textAlign: 'center' },
              ]}
            >
              {formatCountdown(remaining)}
            </Text>
          </Animated.View>
          {(isWarning || isCritical) && remaining != null && remaining > 0 && (
            <Text
              style={[
                typography.caption,
                {
                  color: isCritical ? 'rgba(248,113,113,0.7)' : 'rgba(251,191,36,0.7)',
                  marginTop: 4,
                  textAlign: 'center',
                },
              ]}
            >
              {isCritical
                ? 'Last chance! Redeem now'
                : 'Hurry! Your code expires soon'}
            </Text>
          )}
        </Animated.View>

        {/* Order Summary */}
        <Animated.View entering={FadeInDown.delay(700).duration(350)}>
          <GlassCard style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Beer</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                {beerName ?? 'Loading...'}
              </Text>
            </View>
            <View style={[styles.summaryRow, { marginTop: 8 }]}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Quantity</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                {order?.quantity ?? '-'}
              </Text>
            </View>
            <View style={[styles.summaryRow, { marginTop: 8 }]}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Venue</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                {venueName ?? 'Loading...'}
              </Text>
            </View>
          </GlassCard>
        </Animated.View>

        {/* View Order Details - Expandable */}
        <Animated.View
          entering={FadeInDown.delay(800).duration(350)}
          style={{ marginHorizontal: spacing.screenPadding, marginTop: 12 }}
        >
          <Pressable
            onPress={() => setDetailsExpanded((prev) => !prev)}
            style={styles.detailsToggle}
          >
            <Text style={[typography.label, { color: colors.gold[400] }]}>
              {detailsExpanded ? 'Hide' : 'View'} Order Details
            </Text>
            {detailsExpanded ? (
              <ChevronUp size={16} color={colors.gold[400]} />
            ) : (
              <ChevronDown size={16} color={colors.gold[400]} />
            )}
          </Pressable>

          {detailsExpanded && order && (
            <GlassCard style={{ marginTop: 8 }}>
              <View style={styles.detailRow}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Order ID</Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {order.id.slice(0, 8)}...
                </Text>
              </View>
              <View style={[styles.detailRow, { marginTop: 8 }]}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Status</Text>
                <Text style={[typography.caption, { color: colors.text.secondary, textTransform: 'capitalize' }]}>
                  {order.status.replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={[styles.detailRow, { marginTop: 8 }]}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Serving Size</Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {order.pour_size_oz} oz
                </Text>
              </View>
              <View style={[styles.detailRow, { marginTop: 8 }]}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Unit Price</Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  ${order.unit_price.toFixed(2)}
                </Text>
              </View>
              <View style={styles.goldDivider} />
              <View style={styles.detailRow}>
                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Total Paid</Text>
                <Text style={[typography.caption, { color: colors.gold[400], fontWeight: '600' }]}>
                  ${order.total_amount.toFixed(2)}
                </Text>
              </View>
              {order.paid_at && (
                <View style={[styles.detailRow, { marginTop: 8 }]}>
                  <Text style={[typography.caption, { color: colors.text.tertiary }]}>Paid At</Text>
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {new Date(order.paid_at).toLocaleTimeString()}
                  </Text>
                </View>
              )}
              {order.expires_at && (
                <View style={[styles.detailRow, { marginTop: 8 }]}>
                  <Text style={[typography.caption, { color: colors.text.tertiary }]}>Expires At</Text>
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {new Date(order.expires_at).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            </GlassCard>
          )}
        </Animated.View>

        {/* Leave button */}
        <View style={{ marginHorizontal: spacing.screenPadding, marginTop: 20 }}>
          <GoldButton
            label="Back to Venues"
            variant="ghost"
            onPress={() => {
              Alert.alert(
                'Leave QR Screen?',
                'Make sure you have scanned your code before leaving.',
                [
                  { text: 'Stay', style: 'cancel' },
                  {
                    text: 'Leave',
                    onPress: handleBackToVenues,
                  },
                ],
              );
            }}
          />
        </View>
      </ScrollView>
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
  headerSection: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 20,
    alignItems: 'center',
  },
  qrSection: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 20,
    alignItems: 'center',
  },
  qrGradientFrame: {
    padding: 4,
    borderRadius: radius['3xl'],
  },
  qrWhiteArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius['2xl'],
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrErrorContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLoadingContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionsCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 16,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  instructionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownSection: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 16,
    alignItems: 'center',
  },
  summaryCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goldDivider: {
    height: 1,
    backgroundColor: 'rgba(200,162,77,0.15)',
    marginVertical: 8,
  },
  errorContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.status.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.glass.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSection: {
    paddingHorizontal: spacing.screenPadding,
  },
  pouringContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  pouringGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(200,162,77,0.06)',
    ...shadows.glow,
  },
  lottieContainer: {
    width: 224,
    height: 224,
  },
  celebrationLottie: {
    width: 192,
    height: 192,
  },
});
