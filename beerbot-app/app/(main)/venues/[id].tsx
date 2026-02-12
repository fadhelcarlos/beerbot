import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  RefreshControl,
  StyleSheet,
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
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Thermometer,
  Beer,
  MapPin,
  ChevronRight,
} from 'lucide-react-native';
import {
  fetchVenue,
  fetchVenueTaps,
  subscribeTaps,
} from '@/lib/api/venues';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import { getBeerImageUrl, getVenueImageUrl } from '@/lib/utils/images';
import { GlassCard, GoldButton, PremiumBadge, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  springs,
} from '@/lib/theme';
import type { TapWithBeer, Tap } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FAR_THRESHOLD_MILES = 0.5; // ~800m -- beyond this we show "not at venue" warning

// ---------------------------------------------------------------
// Availability Badge
// ---------------------------------------------------------------

function AvailabilityBadge({
  status,
}: {
  status: TapWithBeer['availability_status'];
}) {
  switch (status) {
    case 'available':
      return <PremiumBadge label="Available" variant="success" />;
    case 'low':
      return <PremiumBadge label="Low" variant="warning" />;
    case 'out':
      return <PremiumBadge label="Sold Out" variant="danger" />;
  }
}

// ---------------------------------------------------------------
// Temperature Display
// ---------------------------------------------------------------

function TemperatureDisplay({
  temperatureF,
  tempOk,
}: {
  temperatureF: number | null;
  tempOk: boolean;
}) {
  if (temperatureF == null) {
    return (
      <View style={styles.tempRow}>
        <Thermometer size={12} color={colors.text.tertiary} strokeWidth={2} />
        <Text
          style={[
            typography.caption,
            { color: colors.text.tertiary, marginLeft: 4 },
          ]}
        >
          N/A
        </Text>
      </View>
    );
  }

  if (!tempOk) {
    return <PremiumBadge label="Cooling down" variant="info" />;
  }

  return (
    <View style={styles.tempRow}>
      <Thermometer size={12} color={colors.text.secondary} strokeWidth={2} />
      <Text
        style={[
          typography.caption,
          { color: colors.text.secondary, marginLeft: 4 },
        ]}
      >
        {Math.round(temperatureF)}
        {'\u00B0'}F
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------
// Beer Card — with thumbnail image
// ---------------------------------------------------------------

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
  const scale = useSharedValue(1);
  const beerImageUrl = getBeerImageUrl(
    tap.beer?.style,
    tap.beer?.image_url,
  );

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
      entering={FadeInDown.delay(index * 50)
        .springify()
        .damping(20)
        .stiffness(300)}
    >
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[
          animatedStyle,
          styles.beerCardWrapper,
          disabled && styles.disabledCard,
        ]}
      >
        <View style={[styles.beerCard, shadows.card]}>
          <View style={styles.beerCardInner}>
            {/* Beer thumbnail */}
            <View style={styles.beerThumbnailContainer}>
              <Image
                source={{ uri: beerImageUrl }}
                style={styles.beerThumbnail}
                resizeMode="cover"
              />
            </View>

            {/* Beer details */}
            <View style={styles.beerDetails}>
              <View style={styles.beerInfoRow}>
                <View style={styles.beerInfoText}>
                  <Text
                    style={[
                      typography.bodyMedium,
                      {
                        color: isOut
                          ? colors.text.tertiary
                          : colors.text.primary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tap.beer?.name ?? 'Unknown Beer'}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: isOut
                          ? colors.text.tertiary
                          : colors.text.secondary,
                        marginTop: 2,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tap.beer?.style ?? 'Unknown Style'}
                    {tap.beer?.abv != null ? ` \u00B7 ${tap.beer.abv}%` : ''}
                  </Text>
                </View>

                {/* Price */}
                {tap.price_12oz != null && (
                  <Text
                    style={[
                      typography.heading,
                      {
                        color: isOut
                          ? colors.text.tertiary
                          : colors.gold[500],
                        fontSize: 18,
                      },
                    ]}
                  >
                    ${tap.price_12oz.toFixed(2)}
                  </Text>
                )}
              </View>

              {/* Badges row */}
              <View style={styles.badgesRow}>
                <AvailabilityBadge status={tap.availability_status} />
                <TemperatureDisplay
                  temperatureF={tap.temperature_f}
                  tempOk={tap.temp_ok}
                />
                {!disabled && (
                  <View style={styles.orderCta}>
                    <ChevronRight
                      size={14}
                      color={colors.gold[500]}
                      strokeWidth={2.5}
                    />
                  </View>
                )}
              </View>

              {/* Low stock warning */}
              {isLow && !isCooling && (
                <View style={styles.lowStockRow}>
                  <AlertTriangle
                    size={12}
                    color={colors.status.warning}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.status.warning,
                        marginLeft: 6,
                        opacity: 0.8,
                      },
                    ]}
                  >
                    Limited {'\u2014'} order at the station
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------

function SectionHeader({ count }: { count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[typography.overline, { color: colors.text.secondary }]}>
        ON TAP
      </Text>
      <Text style={[typography.caption, { color: colors.text.tertiary }]}>
        {count} {count === 1 ? 'beer' : 'beers'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------

const HEADER_HEIGHT_EXPANDED = 200;
const HEADER_HEIGHT_COLLAPSED = 64;

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

  const venue = venueQuery.data;
  const venueImageUrl = getVenueImageUrl(
    venue?.id,
    venue?.name,
    venue?.image_url,
  );

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
      [0, 120],
      [HEADER_HEIGHT_EXPANDED, HEADER_HEIGHT_COLLAPSED],
      Extrapolation.CLAMP,
    );
    return { height };
  });

  const heroImageOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 80],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const titleAnimatedStyle = useAnimatedStyle(() => {
    const fontSize = interpolate(
      scrollY.value,
      [0, 120],
      [22, 17],
      Extrapolation.CLAMP,
    );
    return { fontSize };
  });

  const subtitleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const height = interpolate(
      scrollY.value,
      [0, 60],
      [20, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, height };
  });

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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Collapsible header with venue hero image */}
      <Animated.View
        entering={FadeIn.duration(350)}
        style={[headerAnimatedStyle, styles.headerContainer]}
      >
        {/* Hero image background */}
        <Animated.View style={[StyleSheet.absoluteFill, heroImageOpacity]}>
          <Image
            source={{ uri: venueImageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={[
              'rgba(8,8,15,0.3)',
              'rgba(8,8,15,0.7)',
              'rgba(8,8,15,0.95)',
            ]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Glass overlay for collapsed state */}
        <View style={[StyleSheet.absoluteFill, styles.headerGlassOverlay]} />

        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerTitleText}>
              <Animated.Text
                style={[
                  typography.title,
                  { color: colors.text.primary },
                  titleAnimatedStyle,
                ]}
                numberOfLines={1}
              >
                {venue?.name ?? 'Loading...'}
              </Animated.Text>
              <Animated.View
                style={[styles.subtitleRow, subtitleAnimatedStyle]}
              >
                <MapPin
                  size={12}
                  color={colors.text.secondary}
                  strokeWidth={2}
                />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.text.secondary, marginLeft: 4, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {venue?.address ?? ''}
                </Text>
              </Animated.View>
            </View>
            <GoldButton
              label="Change venue"
              variant="secondary"
              onPress={() => router.back()}
              fullWidth={false}
              style={styles.changeVenueButton}
            />
          </View>
        </View>
      </Animated.View>

      {/* Far from venue warning */}
      {isFarFromVenue && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.warningWrapper}
        >
          <GlassCard style={styles.warningCard}>
            <View style={styles.warningContent}>
              <AlertTriangle
                size={18}
                color={colors.status.warning}
                strokeWidth={2}
              />
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.status.warning,
                    marginLeft: 10,
                    opacity: 0.9,
                  },
                ]}
              >
                You&apos;re not at this venue
              </Text>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {/* Content */}
      {isLoading ? (
        <ShimmerLoader type="beer" count={4} />
      ) : venueQuery.isError || tapsQuery.isError ? (
        <View style={styles.centeredContainer}>
          <AlertTriangle
            size={36}
            color={colors.status.warning}
            strokeWidth={1.5}
          />
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                textAlign: 'center',
                marginTop: 12,
              },
            ]}
          >
            {formatErrorMessage(venueQuery.error ?? tapsQuery.error)}
          </Text>
          <Text
            style={[
              typography.caption,
              {
                color: colors.text.tertiary,
                textAlign: 'center',
                marginTop: 8,
              },
            ]}
          >
            Pull down to try again
          </Text>
        </View>
      ) : (
        <FlatList
          data={taps}
          renderItem={renderBeerCard}
          keyExtractor={keyExtractor}
          ListHeaderComponent={<SectionHeader count={taps.length} />}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 80,
            ...(taps.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={tapsQuery.isFetching && !tapsQuery.isLoading}
              onRefresh={onRefresh}
              tintColor={colors.gold[500]}
              colors={[colors.gold[500]]}
            />
          }
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centeredContainer}>
              <Beer
                size={36}
                color={colors.text.tertiary}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text.secondary,
                    textAlign: 'center',
                    marginTop: 12,
                  },
                ]}
              >
                No beers on tap right now. Check back soon!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGlassOverlay: {
    backgroundColor: 'rgba(8,8,15,0.5)',
  },
  headerContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitleText: {
    flex: 1,
    marginRight: 12,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    overflow: 'hidden',
  },
  changeVenueButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sectionGap,
    paddingBottom: spacing.itemGap,
  },
  warningWrapper: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.itemGap,
  },
  warningCard: {
    borderRadius: radius.lg,
    borderColor: 'rgba(251,191,36,0.20)',
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beerCardWrapper: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.itemGap,
  },
  disabledCard: {
    opacity: 0.5,
  },
  beerCard: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  beerCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  beerThumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    overflow: 'hidden',
    margin: 12,
    flexShrink: 0,
  },
  beerThumbnail: {
    width: 80,
    height: 80,
  },
  beerDetails: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 14,
  },
  beerInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  beerInfoText: {
    flex: 1,
    marginRight: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  orderCta: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(200,162,77,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
