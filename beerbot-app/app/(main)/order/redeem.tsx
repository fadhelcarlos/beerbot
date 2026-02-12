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
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import { getOrder } from '@/lib/api/orders';
import { generateQrToken, generateQrDataString } from '@/lib/utils/qr';
import { fetchVenue } from '@/lib/api/venues';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/types/api';

type ScreenState = 'loading' | 'ready' | 'expired' | 'error';

// ─────────────────────────────────────────────────
// Countdown Timer Hook
// ─────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    function calcRemaining() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      return Math.max(0, Math.floor(diff / 1000));
    }

    setRemaining(calcRemaining());

    const interval = setInterval(() => {
      const secs = calcRemaining();
      setRemaining(secs);
      if (secs <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
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
  const [errorMessage, setErrorMessage] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const originalBrightness = useRef<number | null>(null);

  const remaining = useCountdown(order?.expires_at ?? null);

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

        setScreenState('ready');
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

  // Watch for expiration
  useEffect(() => {
    if (remaining === 0 && screenState === 'ready') {
      setScreenState('expired');
    }
  }, [remaining, screenState]);

  const handleDone = useCallback(() => {
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
            onPress={handleDone}
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
            <Text className="text-white text-xl font-bold mt-6 text-center">
              QR Code Expired
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              Your redemption window has closed. A refund will be processed
              automatically.
            </Text>
          </Animated.View>
        </View>
        <View className="px-6">
          <Pressable
            onPress={handleDone}
            className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
          >
            <Text className="text-lg font-bold text-dark">
              Back to Venues
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Ready State (main QR screen)
  // ─────────────────────────────────────────────────

  const isLow = remaining != null && remaining <= 120;

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(350)}
          className="mx-6 mt-6 items-center"
        >
          <Text className="text-2xl font-bold text-white text-center">
            Your Beer is Ready!
          </Text>
        </Animated.View>

        {/* QR Code */}
        <Animated.View
          entering={FadeIn.delay(200).duration(500)}
          className="mx-6 mt-6 items-center"
        >
          <View className="bg-white rounded-3xl p-6">
            {qrData ? (
              <QRCode value={qrData} size={240} />
            ) : (
              <View className="w-60 h-60 items-center justify-center">
                <ActivityIndicator color="#1a1a2e" />
              </View>
            )}
          </View>
        </Animated.View>

        {/* Go to Tap instruction */}
        <Animated.View
          entering={FadeInDown.delay(350).duration(350)}
          className="mx-6 mt-6 items-center"
        >
          <Text className="text-3xl font-bold text-brand text-center">
            Go to Tap #{tapNumber ?? '?'}
          </Text>
        </Animated.View>

        {/* Step-by-step instructions */}
        <Animated.View
          entering={FadeInDown.delay(450).duration(350)}
          className="mx-6 mt-5 bg-dark-700 rounded-2xl p-5 border border-dark-600"
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
          entering={FadeInDown.delay(550).duration(350)}
          className="mx-6 mt-5 items-center"
        >
          <Text className="text-sm text-white/50 mb-2">Time remaining</Text>
          <Text
            className={`text-4xl font-bold ${
              isLow ? 'text-red-400' : 'text-white'
            }`}
          >
            {formatCountdown(remaining)}
          </Text>
          {isLow && remaining != null && remaining > 0 && (
            <Text className="text-xs text-red-400/70 mt-1">
              Hurry! Your code expires soon
            </Text>
          )}
        </Animated.View>

        {/* Order Summary */}
        <Animated.View
          entering={FadeInDown.delay(650).duration(350)}
          className="mx-6 mt-5 bg-dark-700 rounded-2xl p-4 border border-dark-600"
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
          entering={FadeInDown.delay(750).duration(350)}
          className="mx-6 mt-4"
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

        {/* Done button */}
        <View className="mx-6 mt-6">
          <Pressable
            onPress={() => {
              Alert.alert(
                'Leave QR Screen?',
                'Make sure you have scanned your code before leaving.',
                [
                  { text: 'Stay', style: 'cancel' },
                  {
                    text: 'Leave',
                    onPress: handleDone,
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
