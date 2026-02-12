import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { Beer, MapPin, Search, X, AlertTriangle } from 'lucide-react-native';
import { fetchVenues, fetchVenueActiveTapCounts } from '@/lib/api/venues';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import { GlassCard, PremiumBadge, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  springs,
} from '@/lib/theme';
import type { VenueWithDistance } from '@/types/api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springs.card);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.card);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify().damping(20).stiffness(300)}
    >
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[
          animatedStyle,
          styles.cardWrapper,
          disabled && styles.disabledCard,
        ]}
      >
        <GlassCard
          goldAccent={nearby}
          style={styles.venueCard}
        >
          {/* Hero area */}
          <View
            style={[
              styles.heroArea,
              nearby && styles.heroAreaNearby,
            ]}
          >
            {nearby ? (
              <Beer size={32} color={colors.gold[500]} strokeWidth={1.5} />
            ) : (
              <Beer size={32} color={colors.text.tertiary} strokeWidth={1.5} />
            )}
          </View>

          {/* Venue info row */}
          <View style={styles.venueInfoRow}>
            <View style={styles.venueInfoText}>
              <Text
                style={[
                  typography.heading,
                  { color: disabled ? colors.text.tertiary : colors.text.primary },
                ]}
                numberOfLines={1}
              >
                {venue.name}
              </Text>
              <View style={styles.addressRow}>
                <MapPin
                  size={12}
                  color={disabled ? colors.text.tertiary : colors.text.secondary}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    typography.caption,
                    styles.addressText,
                    { color: disabled ? colors.text.tertiary : colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  {venue.address}
                </Text>
              </View>
            </View>

            {/* Distance badge */}
            {disabled ? (
              <PremiumBadge label="In-person only" variant="neutral" small />
            ) : nearby ? (
              <PremiumBadge label="You're here!" variant="gold" glow />
            ) : distanceLabel ? (
              <PremiumBadge label={distanceLabel} variant="neutral" />
            ) : null}
          </View>

          {/* Tap count */}
          <View style={styles.tapCountRow}>
            <View
              style={[
                styles.tapDot,
                {
                  backgroundColor:
                    tapCount > 0 ? colors.gold[500] : 'transparent',
                  borderWidth: tapCount > 0 ? 0 : 1,
                  borderColor: colors.glass.borderElevated,
                },
              ]}
            />
            <Text
              style={[
                typography.caption,
                { color: disabled ? colors.text.tertiary : colors.text.secondary },
              ]}
            >
              {tapCount} active {tapCount === 1 ? 'tap' : 'taps'}
            </Text>
          </View>
        </GlassCard>
      </AnimatedPressable>
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <View style={styles.headerRow}>
          <Image
            source={require('@/assets/app_logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={[typography.title, { color: colors.text.primary }]}>
            Find a Venue
          </Text>
        </View>
        <Text
          style={[
            typography.caption,
            { color: colors.text.secondary, marginTop: 4 },
          ]}
        >
          {locationDenied
            ? 'Showing all venues alphabetically'
            : coords
              ? 'Sorted by distance from you'
              : 'Detecting your location...'}
        </Text>
      </Animated.View>

      {/* Search bar */}
      <Animated.View
        entering={FadeIn.delay(100).duration(350)}
        style={styles.searchContainer}
      >
        <View style={styles.searchBar}>
          <Search
            size={18}
            color={colors.text.tertiary}
            strokeWidth={2}
          />
          <TextInput
            style={[styles.searchInput, typography.body]}
            placeholder="Search venues..."
            placeholderTextColor={colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.gold[500]}
            cursorColor={colors.gold[500]}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              hitSlop={8}
              style={styles.clearButton}
            >
              <X size={16} color={colors.text.secondary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <ShimmerLoader type="venue" count={4} />
      ) : venuesQuery.isError ? (
        <View style={styles.centeredContainer}>
          <AlertTriangle
            size={36}
            color={colors.status.warning}
            strokeWidth={1.5}
          />
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, textAlign: 'center', marginTop: 12 },
            ]}
          >
            {formatErrorMessage(venuesQuery.error)}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.text.tertiary, textAlign: 'center', marginTop: 8 },
            ]}
          >
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
            paddingBottom: insets.bottom + 80,
            ...(filteredVenues.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={venuesQuery.isFetching && !venuesQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={colors.gold[500]}
              colors={[colors.gold[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centeredContainer}>
              <Search
                size={36}
                color={colors.text.tertiary}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  typography.body,
                  { color: colors.text.secondary, textAlign: 'center', marginTop: 12 },
                ]}
              >
                No venues found
              </Text>
              {searchQuery.length > 0 && (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.tertiary, textAlign: 'center', marginTop: 8 },
                  ]}
                >
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

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  searchContainer: {
    paddingHorizontal: spacing.screenPadding,
    marginTop: 8,
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: colors.glass.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
  },
  cardWrapper: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.itemGap,
  },
  disabledCard: {
    opacity: 0.5,
  },
  venueCard: {
    borderRadius: radius['2xl'],
  },
  heroArea: {
    width: '100%',
    height: 112,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroAreaNearby: {
    backgroundColor: 'rgba(200,162,77,0.08)',
  },
  venueInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  venueInfoText: {
    flex: 1,
    marginRight: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  addressText: {
    flex: 1,
  },
  tapCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  tapDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
