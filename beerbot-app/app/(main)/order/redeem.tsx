import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
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
} from 'react-native-reanimated';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import LottieView from 'lottie-react-native';
import { getOrder } from '@/lib/api/orders';
import { generateQrToken, generateQrDataString } from '@/lib/utils/qr';
import { fetchVenue } from '@/lib/api/venues';
import { supabase } from '@/lib/supabase';
import {
  scheduleRedemptionWarnings,
  cancelScheduledNotification,
} from '@/lib/notifications';
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
// Status Stepper Component
// ─────────────────────────────────────────────────

function StatusStepper({ currentStatus }: { currentStatus: OrderStatus }) {
  const currentIndex = getStepIndex(currentStatus);

  return (
    <View className="flex-row items-center justify-between px-2">
      {ORDER_STEPS.map((step, i) => {
        const isActive = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === ORDER_STEPS.length - 1;

        return (
          <View key={step.key} className="flex-row items-center flex-1">
            {/* Step circle */}
            <View className="items-center">
              <View
                className={`w-8 h-8 rounded-full items-center justify-center ${
                  isCurrent
                    ? 'bg-brand'
                    : isActive
                      ? 'bg-brand/60'
                      : 'bg-dark-600'
                }`}
              >
                {isActive ? (
                  <Text
                    className={`text-xs font-bold ${
                      isCurrent ? 'text-dark' : 'text-dark/70'
                    }`}
                  >
                    {'\u2713'}
                  </Text>
                ) : (
                  <Text className="text-xs text-white/30">{i + 1}</Text>
                )}
              </View>
              <Text
                className={`text-[10px] mt-1 text-center ${
                  isCurrent
                    ? 'text-brand font-bold'
                    : isActive
                      ? 'text-white/60'
                      : 'text-white/30'
                }`}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector line */}
            {!isLast && (
              <View className="flex-1 mx-1">
                <View
                  className={`h-0.5 ${
                    i < currentIndex ? 'bg-brand/60' : 'bg-dark-600'
                  }`}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

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

  // Animated values for status transitions
  const stepperPulse = useSharedValue(1);

  const stepperPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stepperPulse.value }],
  }));

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
      <View
        className="flex-1 bg-dark items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">
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
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u26A0\uFE0F'}</Text>
            <Text className="text-white text-xl font-bold mt-6 text-center">
              Something went wrong
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              {errorMessage}
            </Text>
          </Animated.View>
        </View>
        <View className="px-6">
          <Pressable
            onPress={handleBackToVenues}
            className="w-full items-center justify-center rounded-2xl py-4 bg-dark-600 active:opacity-80"
          >
            <Text className="text-lg font-bold text-white">
              Back to Venues
            </Text>
          </Pressable>
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
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u23F0'}</Text>
            <Text className="text-white text-2xl font-bold mt-6 text-center">
              Order Expired
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              Your redemption window has closed.
            </Text>
            <View className="mt-5 bg-green-900/30 rounded-xl px-5 py-3 border border-green-500/30">
              <Text className="text-green-400 text-sm font-semibold text-center">
                You have not been charged
              </Text>
              <Text className="text-green-400/60 text-xs text-center mt-1">
                A full refund will be processed automatically
              </Text>
            </View>
          </Animated.View>
        </View>
        <View className="px-6 gap-3">
          <Pressable
            onPress={handleBackToVenues}
            className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
          >
            <Text className="text-lg font-bold text-dark">
              Order Again
            </Text>
          </Pressable>
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
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        {/* Status Stepper */}
        <Animated.View
          style={stepperPulseStyle}
          className="mx-6 mt-6"
        >
          <StatusStepper currentStatus={order?.status ?? 'pouring'} />
        </Animated.View>

        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(600)} className="items-center">
            <View className="w-56 h-56">
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
              className="text-2xl font-bold text-brand mt-4 text-center"
            >
              Pouring your beer...
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(400).duration(400)}
              className="text-base text-white/50 mt-2 text-center"
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
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        {/* Status Stepper */}
        <Animated.View
          style={stepperPulseStyle}
          className="mx-6 mt-6"
        >
          <StatusStepper currentStatus="completed" />
        </Animated.View>

        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(600)} className="items-center">
            <View className="w-48 h-48">
              <LottieView
                source={require('@/assets/celebration-animation.json')}
                autoPlay
                loop={false}
                style={{ width: '100%', height: '100%' }}
              />
            </View>
            <Animated.Text
              entering={FadeInUp.delay(200).duration(400)}
              className="text-3xl font-bold text-brand mt-4 text-center"
            >
              Enjoy your beer!
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(400).duration(400)}
              className="text-base text-white/50 mt-2 text-center"
            >
              {beerName ?? 'Your beer'} is ready. Cheers!
            </Animated.Text>
          </Animated.View>
        </View>

        {/* Done button */}
        <View className="px-6">
          <Pressable
            onPress={handleDone}
            className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
          >
            <Text className="text-lg font-bold text-dark">Done</Text>
          </Pressable>
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
    ? 'text-red-400'
    : isWarning
      ? 'text-yellow-400'
      : 'text-white';

  const countdownHintColor = isCritical
    ? 'text-red-400/70'
    : 'text-yellow-400/70';

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Stepper */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(350)}
          style={stepperPulseStyle}
          className="mx-6 mt-6"
        >
          <StatusStepper currentStatus={order?.status ?? 'ready_to_redeem'} />
        </Animated.View>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(350)}
          className="mx-6 mt-5 items-center"
        >
          <Text className="text-2xl font-bold text-white text-center">
            Your Beer is Ready!
          </Text>
        </Animated.View>

        {/* QR Code */}
        <Animated.View
          entering={FadeIn.delay(250).duration(500)}
          className="mx-6 mt-5 items-center"
        >
          <View className="bg-white rounded-3xl p-6">
            {qrData ? (
              <QRCode value={qrData} size={240} />
            ) : qrTimedOut ? (
              <View className="w-60 h-60 items-center justify-center">
                <Text className="text-red-500 text-base font-semibold text-center">
                  Failed to generate QR code
                </Text>
                <Text className="text-gray-500 text-sm text-center mt-2">
                  Please go back and try again
                </Text>
              </View>
            ) : (
              <View className="w-60 h-60 items-center justify-center">
                <ActivityIndicator color="#1a1a2e" />
                <Text className="text-gray-500 text-xs mt-2">
                  Generating QR code...
                </Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Go to Tap instruction */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(350)}
          className="mx-6 mt-5 items-center"
        >
          <Text className="text-3xl font-bold text-brand text-center">
            Go to Tap #{tapNumber ?? '?'}
          </Text>
        </Animated.View>

        {/* Step-by-step instructions */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(350)}
          className="mx-6 mt-4 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <View className="flex-row items-start mb-3">
            <View className="w-7 h-7 rounded-full bg-brand/20 items-center justify-center mr-3 mt-0.5">
              <Text className="text-sm font-bold text-brand">1</Text>
            </View>
            <Text className="text-base text-white/80 flex-1">
              Walk to Tap #{tapNumber ?? '?'}
            </Text>
          </View>
          <View className="flex-row items-start mb-3">
            <View className="w-7 h-7 rounded-full bg-brand/20 items-center justify-center mr-3 mt-0.5">
              <Text className="text-sm font-bold text-brand">2</Text>
            </View>
            <Text className="text-base text-white/80 flex-1">
              Scan this code
            </Text>
          </View>
          <View className="flex-row items-start">
            <View className="w-7 h-7 rounded-full bg-brand/20 items-center justify-center mr-3 mt-0.5">
              <Text className="text-sm font-bold text-brand">3</Text>
            </View>
            <Text className="text-base text-white/80 flex-1">
              Enjoy your beer!
            </Text>
          </View>
        </Animated.View>

        {/* Countdown Timer */}
        <Animated.View
          entering={FadeInDown.delay(600).duration(350)}
          className="mx-6 mt-4 items-center"
        >
          <Text className="text-sm text-white/50 mb-2">Time remaining</Text>
          <Text className={`text-4xl font-bold ${countdownColor}`}>
            {formatCountdown(remaining)}
          </Text>
          {(isWarning || isCritical) && remaining != null && remaining > 0 && (
            <Text className={`text-xs ${countdownHintColor} mt-1`}>
              {isCritical
                ? 'Last chance! Redeem now'
                : 'Hurry! Your code expires soon'}
            </Text>
          )}
        </Animated.View>

        {/* Order Summary */}
        <Animated.View
          entering={FadeInDown.delay(700).duration(350)}
          className="mx-6 mt-4 bg-dark-700 rounded-2xl p-4 border border-dark-600"
        >
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm text-white/50">Beer</Text>
            <Text className="text-sm text-white font-medium">
              {beerName ?? 'Loading...'}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm text-white/50">Quantity</Text>
            <Text className="text-sm text-white font-medium">
              {order?.quantity ?? '-'}
            </Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-sm text-white/50">Venue</Text>
            <Text className="text-sm text-white font-medium">
              {venueName ?? 'Loading...'}
            </Text>
          </View>
        </Animated.View>

        {/* View Order Details - Expandable */}
        <Animated.View
          entering={FadeInDown.delay(800).duration(350)}
          className="mx-6 mt-3"
        >
          <Pressable
            onPress={() => setDetailsExpanded((prev) => !prev)}
            className="flex-row items-center justify-center py-3 active:opacity-60"
          >
            <Text className="text-sm text-brand font-semibold mr-1">
              {detailsExpanded ? 'Hide' : 'View'} Order Details
            </Text>
            <Text className="text-xs text-brand">
              {detailsExpanded ? '\u25B2' : '\u25BC'}
            </Text>
          </Pressable>

          {detailsExpanded && order && (
            <View className="bg-dark-700 rounded-2xl p-4 border border-dark-600 mt-1">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-white/40">Order ID</Text>
                <Text className="text-xs text-white/60 font-mono">
                  {order.id.slice(0, 8)}...
                </Text>
              </View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-white/40">Status</Text>
                <Text className="text-xs text-white/60 capitalize">
                  {order.status.replace(/_/g, ' ')}
                </Text>
              </View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-white/40">Serving Size</Text>
                <Text className="text-xs text-white/60">
                  {order.pour_size_oz} oz
                </Text>
              </View>
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-white/40">Unit Price</Text>
                <Text className="text-xs text-white/60">
                  ${order.unit_price.toFixed(2)}
                </Text>
              </View>
              <View className="h-px bg-dark-600 my-2" />
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-white/40">Total Paid</Text>
                <Text className="text-xs text-brand font-semibold">
                  ${order.total_amount.toFixed(2)}
                </Text>
              </View>
              {order.paid_at && (
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-xs text-white/40">Paid At</Text>
                  <Text className="text-xs text-white/60">
                    {new Date(order.paid_at).toLocaleTimeString()}
                  </Text>
                </View>
              )}
              {order.expires_at && (
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs text-white/40">Expires At</Text>
                  <Text className="text-xs text-white/60">
                    {new Date(order.expires_at).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {/* Leave button */}
        <View className="mx-6 mt-5">
          <Pressable
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
            className="w-full items-center justify-center rounded-2xl py-4 bg-dark-600 active:opacity-80"
          >
            <Text className="text-base font-semibold text-white/70">
              Back to Venues
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
