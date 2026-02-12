import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { fetchVenues, fetchVenueActiveTapCounts } from '@/lib/api/venues';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import SkeletonLoader from '@/components/SkeletonLoader';
import type { VenueWithDistance } from '@/types/api';

const NEARBY_THRESHOLD_MILES = 0.124; // ~200m

function formatDistance(miles: number | null): string | null {
  if (miles == null) return null;
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft away`;
  return `${miles.toFixed(1)} mi away`;
}

function isWithinRange(miles: number | null): boolean {
  return miles != null && miles <= NEARBY_THRESHOLD_MILES;
}

// -------------------------------------------------------------------
// VenueCard
// -------------------------------------------------------------------

function VenueCard({
  venue,
  tapCount,
  onPress,
  index,
}: {
  venue: VenueWithDistance;
  tapCount: number;
  onPress: () => void;
  index: number;
}) {
  const nearby = isWithinRange(venue.distance_miles);
  const distanceLabel = formatDistance(venue.distance_miles);
  const disabled = !venue.mobile_ordering_enabled;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350)}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={`mx-4 mb-3 rounded-2xl p-4 ${
          nearby
            ? 'bg-brand/10 border-2 border-brand'
            : disabled
              ? 'bg-dark-700/50 border border-dark-600'
              : 'bg-dark-700 border border-dark-600'
        } ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
      >
        {/* Placeholder image area */}
        <View
          className={`w-full h-28 rounded-xl mb-3 items-center justify-center ${
            nearby ? 'bg-brand/15' : 'bg-dark-600'
          }`}
        >
          <Text className="text-3xl">{nearby ? '\uD83C\uDF7B' : '\uD83C\uDF7A'}</Text>
        </View>

        {/* Venue info */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text
              className={`text-lg font-bold ${disabled ? 'text-white/40' : 'text-white'}`}
              numberOfLines={1}
            >
              {venue.name}
            </Text>
            <Text
              className={`text-sm mt-0.5 ${disabled ? 'text-white/25' : 'text-white/50'}`}
              numberOfLines={1}
            >
              {venue.address}
            </Text>
          </View>

          {/* Distance badge or In-person only */}
          {disabled ? (
            <View className="bg-dark-600 rounded-full px-3 py-1">
              <Text className="text-xs text-white/40">In-person only</Text>
            </View>
          ) : nearby ? (
            <View className="bg-brand rounded-full px-3 py-1">
              <Text className="text-xs font-bold text-dark">
                You&apos;re here!
              </Text>
            </View>
          ) : distanceLabel ? (
            <View className="bg-dark-500 rounded-full px-3 py-1">
              <Text className="text-xs text-white/70">{distanceLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* Tap count */}
        <View className="flex-row items-center mt-2">
          <View
            className={`w-2 h-2 rounded-full mr-2 ${
              tapCount > 0 ? 'bg-green-500' : 'bg-dark-400'
            }`}
          />
          <Text
            className={`text-xs ${disabled ? 'text-white/25' : 'text-white/50'}`}
          >
            {tapCount} active {tapCount === 1 ? 'tap' : 'taps'}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// -------------------------------------------------------------------
// Main Screen
// -------------------------------------------------------------------

export default function VenuesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);

  // Request location on mount
  const locationQuery = useQuery({
    queryKey: ['user-location'],
    queryFn: async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        setLocationChecked(true);
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const result = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setCoords(result);
      setLocationDenied(false);
      setLocationChecked(true);
      return result;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Fetch venues (depends on location)
  const venuesQuery = useQuery({
    queryKey: ['venues', coords?.latitude, coords?.longitude],
    queryFn: () =>
      fetchVenues(
        coords
          ? { latitude: coords.latitude, longitude: coords.longitude }
          : undefined,
      ),
    enabled: locationChecked,
    staleTime: 1000 * 60,
  });

  // Fetch active tap counts for all fetched venues
  const venueIds = useMemo(
    () => (venuesQuery.data ?? []).map((v) => v.id),
    [venuesQuery.data],
  );

  const tapCountsQuery = useQuery({
    queryKey: ['venue-tap-counts', venueIds],
    queryFn: () => fetchVenueActiveTapCounts(venueIds),
    enabled: venueIds.length > 0,
    staleTime: 1000 * 60,
  });

  // Filter venues by search query
  const filteredVenues = useMemo(() => {
    const venues = venuesQuery.data ?? [];
    if (!searchQuery.trim()) return venues;

    const q = searchQuery.toLowerCase().trim();
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q),
    );
  }, [venuesQuery.data, searchQuery]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    // Re-check location
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setLocationDenied(false);
      } else {
        setLocationDenied(true);
        setCoords(null);
      }
    } catch {
      // Keep current state on error
    }
    setLocationChecked(true);
    // Invalidate queries to refetch
    await Promise.all([
      venuesQuery.refetch(),
      tapCountsQuery.refetch(),
    ]);
  }, [venuesQuery, tapCountsQuery]);

  const isLoading =
    !locationChecked || venuesQuery.isLoading || locationQuery.isLoading;
  const tapCounts = useMemo(
    () => tapCountsQuery.data ?? {},
    [tapCountsQuery.data],
  );

  const renderVenueCard = useCallback(
    ({ item, index }: { item: VenueWithDistance; index: number }) => (
      <VenueCard
        venue={item}
        tapCount={tapCounts[item.id] ?? 0}
        index={index}
        onPress={() =>
          router.push({
            pathname: '/(main)/venues/[id]',
            params: { id: item.id },
          })
        }
      />
    ),
    [tapCounts, router],
  );

  const keyExtractor = useCallback((item: VenueWithDistance) => item.id, []);

  return (
    <View
      className="flex-1 bg-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-white">Find a Venue</Text>
        <Text className="text-sm text-white/50 mt-1">
          {locationDenied
            ? 'Showing all venues alphabetically'
            : coords
              ? 'Sorted by distance from you'
              : 'Detecting your location...'}
        </Text>
      </Animated.View>

      {/* Search bar */}
      <Animated.View entering={FadeIn.delay(100).duration(350)} className="px-4 mt-2 mb-3">
        <View className="bg-dark-700 rounded-xl flex-row items-center px-4">
          <Text className="text-white/40 mr-2">{'\uD83D\uDD0D'}</Text>
          <TextInput
            className="flex-1 py-3 text-white text-base"
            placeholder="Search venues..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              className="active:opacity-60"
              hitSlop={8}
            >
              <Text className="text-white/40 text-lg">{'\u2715'}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader type="venue" count={4} />
      ) : venuesQuery.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-3xl mb-3">{'\u26A0\uFE0F'}</Text>
          <Text className="text-white/70 text-base text-center">
            {formatErrorMessage(venuesQuery.error)}
          </Text>
          <Text className="text-white/40 text-sm text-center mt-2">
            Pull down to try again
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredVenues}
          renderItem={renderVenueCard}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: insets.bottom + 24,
            ...(filteredVenues.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={venuesQuery.isFetching && !venuesQuery.isLoading}
              onRefresh={onRefresh}
              tintColor="#f59e0b"
              colors={['#f59e0b']}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-3xl mb-3">{'\uD83C\uDFDA\uFE0F'}</Text>
              <Text className="text-white/70 text-base text-center">
                No venues found
              </Text>
              {searchQuery.length > 0 && (
                <Text className="text-white/40 text-sm text-center mt-2">
                  Try a different search term
                </Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}
