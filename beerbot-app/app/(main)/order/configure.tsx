import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
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
import { fetchVenueTaps, subscribeTaps } from '@/lib/api/venues';
import type { Tap, TapWithBeer } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 6;
const LOW_INVENTORY_THRESHOLD_OZ = 24; // Alert if oz_remaining drops below this during viewing

// ─────────────────────────────────────────────────
// Availability Badge (reused pattern from beer list)
// ─────────────────────────────────────────────────

function AvailabilityBadge({
  status,
}: {
  status: TapWithBeer['availability_status'];
}) {
  switch (status) {
    case 'available':
      return (
        <View className="bg-green-500/20 rounded-full px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-green-400">
            Available
          </Text>
        </View>
      );
    case 'low':
      return (
        <View className="bg-yellow-500/20 rounded-full px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-yellow-400">Low</Text>
        </View>
      );
    case 'out':
      return (
        <View className="bg-white/10 rounded-full px-2.5 py-0.5">
          <Text className="text-xs font-semibold text-white/40">Out</Text>
        </View>
      );
  }
}

// ─────────────────────────────────────────────────
// Temperature Display
// ─────────────────────────────────────────────────

function TemperatureDisplay({
  temperatureF,
  tempOk,
}: {
  temperatureF: number | null;
  tempOk: boolean;
}) {
  if (temperatureF == null) {
    return <Text className="text-xs text-white/30">Temp: N/A</Text>;
  }

  if (!tempOk) {
    return (
      <View className="bg-blue-500/20 rounded-full px-2.5 py-0.5 flex-row items-center">
        <Text className="text-xs mr-1">{'\u2744\uFE0F'}</Text>
        <Text className="text-xs font-semibold text-blue-400">
          Cooling down
        </Text>
      </View>
    );
  }

  return (
    <Text className="text-xs text-white/50">
      {Math.round(temperatureF)}{'\u00B0'}F
    </Text>
  );
}

// ─────────────────────────────────────────────────
// Quantity Stepper
// ─────────────────────────────────────────────────

function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedQuantityStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Trigger a spring bounce whenever quantity changes
  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 300 }, () => {
      // Spring settles at 1
    });
    // Briefly set to 1.15 before spring snaps it back
    scale.value = 1.15;
  }, [quantity, scale]);

  return (
    <View className="flex-row items-center justify-center">
      {/* Decrement button */}
      <Pressable
        onPress={onDecrement}
        disabled={quantity <= MIN_QUANTITY}
        className={`w-12 h-12 rounded-full items-center justify-center ${
          quantity <= MIN_QUANTITY
            ? 'bg-dark-600/50'
            : 'bg-dark-600 active:bg-dark-500'
        }`}
        hitSlop={8}
      >
        <Text
          className={`text-2xl font-bold ${
            quantity <= MIN_QUANTITY ? 'text-white/20' : 'text-white'
          }`}
        >
          {'\u2212'}
        </Text>
      </Pressable>

      {/* Quantity display */}
      <Animated.View
        style={animatedQuantityStyle}
        className="w-20 items-center"
      >
        <Text className="text-4xl font-bold text-white">{quantity}</Text>
      </Animated.View>

      {/* Increment button */}
      <Pressable
        onPress={onIncrement}
        disabled={quantity >= MAX_QUANTITY}
        className={`w-12 h-12 rounded-full items-center justify-center ${
          quantity >= MAX_QUANTITY
            ? 'bg-dark-600/50'
            : 'bg-dark-600 active:bg-dark-500'
        }`}
        hitSlop={8}
      >
        <Text
          className={`text-2xl font-bold ${
            quantity >= MAX_QUANTITY ? 'text-white/20' : 'text-white'
          }`}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function OrderConfigureScreen() {
  const { tapId, venueId } = useLocalSearchParams<{
    tapId: string;
    venueId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [quantity, setQuantity] = useState(1);
  const hasNavigatedAway = useRef(false);

  // Fetch taps for this venue (uses cached data if available from beer list)
  const tapsQuery = useQuery({
    queryKey: ['venue-taps', venueId],
    queryFn: () => fetchVenueTaps(venueId!),
    enabled: !!venueId,
    staleTime: 1000 * 30,
  });

  // Find the specific tap from the cached taps list
  const tap = useMemo(
    () => tapsQuery.data?.find((t) => t.id === tapId) ?? null,
    [tapsQuery.data, tapId],
  );

  const beer = tap?.beer ?? null;
  const unitPrice = tap?.price_12oz ?? 0;
  const totalPrice = unitPrice * quantity;

  // Subscribe to realtime tap updates
  useEffect(() => {
    if (!venueId) return;

    channelRef.current = subscribeTaps(venueId, (updatedTap: Tap) => {
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
    });

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [venueId, queryClient]);

  // Watch for inventory drop below threshold — alert and navigate back
  useEffect(() => {
    if (!tap || hasNavigatedAway.current) return;

    if (tap.availability_status === 'out') {
      hasNavigatedAway.current = true;
      Alert.alert(
        'Beer Unavailable',
        `${beer?.name ?? 'This beer'} is no longer available. Returning to the beer list.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } else if (tap.oz_remaining < LOW_INVENTORY_THRESHOLD_OZ && tap.availability_status === 'low') {
      // Only alert once — check is implicit via the ref guard
    }
  }, [tap, beer?.name, router]);

  // Quantity handlers
  const handleDecrement = useCallback(() => {
    setQuantity((q) => Math.max(MIN_QUANTITY, q - 1));
  }, []);

  const handleIncrement = useCallback(() => {
    setQuantity((q) => Math.min(MAX_QUANTITY, q + 1));
  }, []);

  // Continue to age verification
  const handleContinue = useCallback(() => {
    if (!tap) return;
    // Navigate to age verification gate (future US)
    // For now, navigate forward with order params
    router.push({
      pathname: '/(main)/order/configure',
      params: {
        tapId: tap.id,
        venueId: tap.venue_id,
      },
    });
  }, [tap, router]);

  if (tapsQuery.isLoading) {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">Loading beer details...</Text>
      </View>
    );
  }

  if (!tap || !beer) {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-3xl mb-3">{'\u26A0\uFE0F'}</Text>
        <Text className="text-white/70 text-base text-center">
          Beer not found or no longer available.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 bg-dark-600 rounded-full px-6 py-3 active:opacity-70"
        >
          <Text className="text-brand font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          className="px-6 pt-4 pb-2 self-start active:opacity-60"
          hitSlop={16}
        >
          <Text className="text-brand text-base">{'\u2190'} Back</Text>
        </Pressable>

        {/* Beer image placeholder */}
        <Animated.View
          entering={FadeIn.duration(400)}
          className="mx-6 mt-4 h-48 rounded-2xl bg-dark-700 items-center justify-center border border-dark-600 overflow-hidden"
        >
          {beer.image_url ? (
            <Text className="text-white/30 text-sm">Image</Text>
          ) : (
            <View className="items-center">
              <Text className="text-6xl">{'\uD83C\uDF7A'}</Text>
              <Text className="text-white/20 text-xs mt-2">{beer.style}</Text>
            </View>
          )}
        </Animated.View>

        {/* Beer details */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(350)}
          className="mx-6 mt-6"
        >
          <Text className="text-2xl font-bold text-white">{beer.name}</Text>
          <Text className="text-base text-white/50 mt-1">
            {beer.style} {'\u00B7'} {beer.abv}% ABV
          </Text>
          {beer.description ? (
            <Text className="text-sm text-white/40 mt-3 leading-5">
              {beer.description}
            </Text>
          ) : null}
        </Animated.View>

        {/* Tap number + live badges */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(350)}
          className="mx-6 mt-5 flex-row items-center gap-3"
        >
          <View className="bg-brand/15 rounded-full px-3 py-1">
            <Text className="text-sm font-semibold text-brand">
              Tap #{tap.tap_number}
            </Text>
          </View>
          <AvailabilityBadge status={tap.availability_status} />
          <TemperatureDisplay
            temperatureF={tap.temperature_f}
            tempOk={tap.temp_ok}
          />
        </Animated.View>

        {/* Serving size info */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(350)}
          className="mx-6 mt-6 bg-dark-700 rounded-2xl p-4 border border-dark-600"
        >
          <Text className="text-sm text-white/50">Serving Size</Text>
          <Text className="text-lg font-semibold text-white mt-1">12 oz</Text>
        </Animated.View>

        {/* Quantity stepper */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(350)}
          className="mx-6 mt-6"
        >
          <Text className="text-sm text-white/50 text-center mb-4">
            Quantity
          </Text>
          <QuantityStepper
            quantity={quantity}
            onDecrement={handleDecrement}
            onIncrement={handleIncrement}
          />
        </Animated.View>

        {/* Price breakdown */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(350)}
          className="mx-6 mt-8 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <View className="flex-row justify-between items-center">
            <Text className="text-sm text-white/50">Unit price</Text>
            <Text className="text-sm text-white/70">
              ${unitPrice.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mt-2">
            <Text className="text-sm text-white/50">Quantity</Text>
            <Text className="text-sm text-white/70">{'\u00D7'} {quantity}</Text>
          </View>
          <View className="h-px bg-dark-600 my-3" />
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold text-white">Total</Text>
            <Text className="text-xl font-bold text-brand">
              ${totalPrice.toFixed(2)}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Fixed CTA button at bottom */}
      <Animated.View
        entering={FadeIn.delay(600).duration(400)}
        className="absolute bottom-0 left-0 right-0 px-6 bg-dark border-t border-dark-600"
        style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
      >
        <Pressable
          onPress={handleContinue}
          disabled={tap.availability_status === 'out' || !tap.temp_ok}
          className={`w-full items-center justify-center rounded-2xl py-4 ${
            tap.availability_status !== 'out' && tap.temp_ok
              ? 'bg-brand active:opacity-80'
              : 'bg-brand/40'
          }`}
        >
          <Text className="text-lg font-bold text-dark">
            Continue {'\u00B7'} ${totalPrice.toFixed(2)}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
