import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchVenue,
  fetchVenueTaps,
  subscribeTaps,
} from '@/lib/api/venues';
import type { TapWithBeer, Tap } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

const FAR_THRESHOLD_MILES = 0.5; // ~800m — beyond this we show "not at venue" warning

// ─────────────────────────────────────────────────
// Availability Badge
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
// Beer Card
// ─────────────────────────────────────────────────

function BeerCard({
  tap,
  onPress,
  index,
}: {
  tap: TapWithBeer;
  onPress: () => void;
  index: number;
}) {
  const isOut = tap.availability_status === 'out';
  const isLow = tap.availability_status === 'low';
  const isCooling = !tap.temp_ok;
  const disabled = isOut || isCooling;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`mx-4 mb-3 rounded-2xl p-4 border ${
          isOut
            ? 'bg-dark-700/40 border-dark-600 opacity-50'
            : isCooling
              ? 'bg-dark-700/60 border-blue-500/30'
              : 'bg-dark-700 border-dark-600 active:opacity-80'
        }`}
      >
        <View className="flex-row items-start justify-between">
          {/* Beer info */}
          <View className="flex-1 mr-3">
            <Text
              className={`text-lg font-bold ${isOut ? 'text-white/40' : 'text-white'}`}
              numberOfLines={1}
            >
              {tap.beer?.name ?? 'Unknown Beer'}
            </Text>
            <Text
              className={`text-sm mt-0.5 ${isOut ? 'text-white/20' : 'text-white/50'}`}
              numberOfLines={1}
            >
              {tap.beer?.style ?? 'Unknown Style'}
              {tap.beer?.abv != null ? ` \u00B7 ${tap.beer.abv}%` : ''}
            </Text>
          </View>

          {/* Price */}
          {tap.price_12oz != null && (
            <Text
              className={`text-lg font-bold ${isOut ? 'text-white/30' : 'text-brand'}`}
            >
              ${tap.price_12oz.toFixed(2)}
            </Text>
          )}
        </View>

        {/* Badges row */}
        <View className="flex-row items-center mt-3 gap-2">
          <AvailabilityBadge status={tap.availability_status} />
          <TemperatureDisplay
            temperatureF={tap.temperature_f}
            tempOk={tap.temp_ok}
          />
        </View>

        {/* Low stock warning */}
        {isLow && !isCooling && (
          <Text className="text-xs text-yellow-400/80 mt-2">
            Limited {'\u2014'} order at the station
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

const HEADER_HEIGHT_EXPANDED = 120;
const HEADER_HEIGHT_COLLAPSED = 60;

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollY = useSharedValue(0);
  const [isFarFromVenue, setIsFarFromVenue] = useState(false);

  // Fetch venue info
  const venueQuery = useQuery({
    queryKey: ['venue', id],
    queryFn: () => fetchVenue(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch taps for this venue
  const tapsQuery = useQuery({
    queryKey: ['venue-taps', id],
    queryFn: () => fetchVenueTaps(id!),
    enabled: !!id,
    staleTime: 1000 * 30,
  });

  // Check if user is far from venue
  useEffect(() => {
    if (!venueQuery.data) return;

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        // Haversine approximation for short distances
        const lat1 = loc.coords.latitude;
        const lon1 = loc.coords.longitude;
        const lat2 = Number(venueQuery.data.latitude);
        const lon2 = Number(venueQuery.data.longitude);
        const R = 3959; // Earth radius in miles
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceMiles = R * c;

        setIsFarFromVenue(distanceMiles > FAR_THRESHOLD_MILES);
      } catch {
        // Silently ignore location errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [venueQuery.data]);

  // Subscribe to realtime tap updates
  useEffect(() => {
    if (!id) return;

    channelRef.current = subscribeTaps(id, (updatedTap: Tap) => {
      queryClient.setQueryData<TapWithBeer[]>(
        ['venue-taps', id],
        (prev) => {
          if (!prev) return prev;
          return prev.map((tap) => {
            if (tap.id !== updatedTap.id) return tap;
            // Merge updated tap fields, keep beer and pricing from cache
            const ozRemaining = updatedTap.oz_remaining;
            const lowThreshold = updatedTap.low_threshold_oz;
            let availabilityStatus: TapWithBeer['availability_status'] =
              'available';
            if (ozRemaining <= 0) availabilityStatus = 'out';
            else if (ozRemaining <= lowThreshold)
              availabilityStatus = 'low';

            return {
              ...tap,
              ...updatedTap,
              beer: tap.beer,
              price_12oz: tap.price_12oz,
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
  }, [id, queryClient]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    await tapsQuery.refetch();
  }, [tapsQuery]);

  // Collapsible header animation
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      scrollY.value,
      [0, 80],
      [HEADER_HEIGHT_EXPANDED, HEADER_HEIGHT_COLLAPSED],
      Extrapolation.CLAMP,
    );
    return { height };
  });

  const titleAnimatedStyle = useAnimatedStyle(() => {
    const fontSize = interpolate(
      scrollY.value,
      [0, 80],
      [24, 18],
      Extrapolation.CLAMP,
    );
    return { fontSize };
  });

  const subtitleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 50],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const height = interpolate(
      scrollY.value,
      [0, 50],
      [20, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, height };
  });

  const venue = venueQuery.data;
  const taps = useMemo(() => tapsQuery.data ?? [], [tapsQuery.data]);

  const isLoading = venueQuery.isLoading || tapsQuery.isLoading;

  const renderBeerCard = useCallback(
    ({ item, index }: { item: TapWithBeer; index: number }) => (
      <BeerCard
        tap={item}
        index={index}
        onPress={() => {
          router.push({
            pathname: '/(main)/order/configure',
            params: { tapId: item.id, venueId: id },
          });
        }}
      />
    ),
    [router, id],
  );

  const keyExtractor = useCallback((item: TapWithBeer) => item.id, []);

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      {/* Collapsible header */}
      <Animated.View
        entering={FadeIn.duration(350)}
        style={headerAnimatedStyle}
        className="px-4 justify-end pb-3 overflow-hidden"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Animated.Text
              className="font-bold text-white"
              style={titleAnimatedStyle}
              numberOfLines={1}
            >
              {venue?.name ?? 'Loading...'}
            </Animated.Text>
            <Animated.Text
              className="text-sm text-white/50 mt-0.5"
              style={subtitleAnimatedStyle}
              numberOfLines={1}
            >
              {venue?.address ?? ''}
            </Animated.Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            className="bg-dark-600 rounded-full px-4 py-2 active:opacity-70"
          >
            <Text className="text-sm font-semibold text-brand">
              Change venue
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Far from venue warning */}
      {isFarFromVenue && (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="mx-4 mb-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5"
        >
          <Text className="text-sm text-yellow-400/80 text-center">
            You&apos;re not at this venue
          </Text>
        </Animated.View>
      )}

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#f59e0b" size="large" />
          <Text className="text-white/40 text-sm mt-4">
            Loading beers...
          </Text>
        </View>
      ) : venueQuery.isError || tapsQuery.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-3xl mb-3">{'\u26A0\uFE0F'}</Text>
          <Text className="text-white/70 text-base text-center">
            Failed to load beers. Pull down to try again.
          </Text>
        </View>
      ) : (
        <FlatList
          data={taps}
          renderItem={renderBeerCard}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: insets.bottom + 24,
            ...(taps.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={tapsQuery.isFetching && !tapsQuery.isLoading}
              onRefresh={onRefresh}
              tintColor="#f59e0b"
              colors={['#f59e0b']}
            />
          }
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-3xl mb-3">{'\uD83C\uDF7A'}</Text>
              <Text className="text-white/70 text-base text-center">
                No beers on tap right now. Check back soon!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
