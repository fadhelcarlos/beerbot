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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Beer,
  Hash,
  Thermometer,
  Minus,
  Plus,
  AlertTriangle,
  Snowflake,
  GlassWater,
} from 'lucide-react-native';
import { fetchVenueTaps, subscribeTaps } from '@/lib/api/venues';
import { getBeerImageUrl } from '@/lib/utils/images';
import { GlassCard, GoldButton, PremiumBadge, ShimmerLoader } from '@/components/ui';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  springs,
  goldGradientSubtle,
} from '@/lib/theme';
import type { Tap, TapWithBeer } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 6;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
      return <PremiumBadge label="Available" variant="success" />;
    case 'low':
      return <PremiumBadge label="Low" variant="warning" glow />;
    case 'out':
      return <PremiumBadge label="Sold Out" variant="danger" />;
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
    return (
      <View style={styles.tempRow}>
        <Thermometer size={12} color={colors.text.tertiary} />
        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 4 }]}>
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
      <Thermometer size={12} color={colors.text.secondary} />
      <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 4 }]}>
        {Math.round(temperatureF)}{'\u00B0'}F
      </Text>
    </View>
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
  const decrementScale = useSharedValue(1);
  const incrementScale = useSharedValue(1);

  const animatedQuantityStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const decrementAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: decrementScale.value }],
  }));

  const incrementAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: incrementScale.value }],
  }));

  // Trigger a spring bounce whenever quantity changes
  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 300 }, () => {
      // Spring settles at 1
    });
    // Briefly set to 1.15 before spring snaps it back
    scale.value = 1.15;
  }, [quantity, scale]);

  const handleDecrement = () => {
    decrementScale.value = withSpring(0.85, springs.snappy, () => {
      decrementScale.value = withSpring(1, springs.button);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onDecrement();
  };

  const handleIncrement = () => {
    incrementScale.value = withSpring(0.85, springs.snappy, () => {
      incrementScale.value = withSpring(1, springs.button);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onIncrement();
  };

  return (
    <View style={styles.stepperRow}>
      {/* Decrement button */}
      <AnimatedPressable
        onPress={handleDecrement}
        disabled={quantity <= MIN_QUANTITY}
        style={[
          decrementAnimStyle,
          styles.stepperButton,
          quantity <= MIN_QUANTITY && styles.stepperButtonDisabled,
        ]}
        hitSlop={8}
      >
        <Minus
          size={20}
          color={quantity <= MIN_QUANTITY ? colors.text.tertiary : colors.gold[400]}
          strokeWidth={2.5}
        />
      </AnimatedPressable>

      {/* Quantity display */}
      <Animated.View style={[animatedQuantityStyle, styles.quantityContainer]}>
        <Text style={[typography.display, { color: colors.text.primary }]}>
          {quantity}
        </Text>
      </Animated.View>

      {/* Increment button */}
      <AnimatedPressable
        onPress={handleIncrement}
        disabled={quantity >= MAX_QUANTITY}
        style={[
          incrementAnimStyle,
          styles.stepperButton,
          quantity >= MAX_QUANTITY && styles.stepperButtonDisabled,
        ]}
        hitSlop={8}
      >
        <Plus
          size={20}
          color={quantity >= MAX_QUANTITY ? colors.text.tertiary : colors.gold[400]}
          strokeWidth={2.5}
        />
      </AnimatedPressable>
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

  // Watch for inventory drop — alert and navigate back when beer becomes unavailable
  const previousAvailabilityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tap || hasNavigatedAway.current) return;

    const prev = previousAvailabilityRef.current;
    previousAvailabilityRef.current = tap.availability_status;

    // Only alert on transitions (not on initial load)
    if (prev === null) return;

    if (tap.availability_status === 'out' && prev !== 'out') {
      hasNavigatedAway.current = true;
      Alert.alert(
        'Beer Unavailable',
        'This beer is no longer available for mobile ordering.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } else if (tap.availability_status === 'low' && prev === 'available') {
      hasNavigatedAway.current = true;
      Alert.alert(
        'Beer Unavailable',
        'This beer is no longer available for mobile ordering.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }, [tap, router]);

  // Quantity handlers
  const handleDecrement = useCallback(() => {
    setQuantity((q) => Math.max(MIN_QUANTITY, q - 1));
  }, []);

  const handleIncrement = useCallback(() => {
    setQuantity((q) => Math.min(MAX_QUANTITY, q + 1));
  }, []);

  // Continue to age verification gate
  const handleContinue = useCallback(() => {
    if (!tap) return;
    router.push({
      pathname: '/(main)/order/verify-age',
      params: {
        tapId: tap.id,
        venueId: tap.venue_id,
        quantity: String(quantity),
        totalPrice: totalPrice.toFixed(2),
      },
    });
  }, [tap, router, quantity, totalPrice]);

  if (tapsQuery.isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ShimmerLoader type="beer" count={3} />
      </View>
    );
  }

  if (!tap || !beer) {
    return (
      <View style={[styles.screenCenter, { paddingTop: insets.top }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.centered}>
          <View style={styles.errorIconCircle}>
            <AlertTriangle size={32} color={colors.status.warning} />
          </View>
          <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 12 }]}>
            Beer not found or no longer available.
          </Text>
          <GoldButton
            label="Go back"
            variant="secondary"
            onPress={() => router.back()}
            fullWidth={false}
            style={{ marginTop: 24, paddingHorizontal: 32 }}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
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

        {/* Beer hero image */}
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={styles.imageCard}>
            <Image
              source={{ uri: getBeerImageUrl(beer.style, beer.image_url) }}
              style={styles.beerHeroImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(8,8,15,0.7)', 'rgba(8,8,15,0.95)']}
              locations={[0.3, 0.7, 1]}
              style={StyleSheet.absoluteFill}
            />
            {/* Beer style badge floating on image */}
            <View style={styles.imageOverlayBadge}>
              <PremiumBadge label={beer.style} variant="gold" />
            </View>
          </View>
        </Animated.View>

        {/* Beer details */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(350)}
          style={styles.section}
        >
          <Text style={[typography.title, { color: colors.text.primary }]}>
            {beer.name}
          </Text>
          <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4 }]}>
            {beer.style} {'\u00B7'} {beer.abv}% ABV
          </Text>
          {beer.description ? (
            <Text style={[typography.body, { color: colors.text.tertiary, marginTop: 12, fontSize: 14, lineHeight: 20 }]}>
              {beer.description}
            </Text>
          ) : null}
        </Animated.View>

        {/* Tap number + live badges */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(350)}
          style={[styles.section, styles.badgeRow]}
        >
          <View style={styles.tapBadge}>
            <Hash size={12} color={colors.gold[400]} />
            <Text style={[typography.caption, { color: colors.gold[400], marginLeft: 2 }]}>
              Tap {tap.tap_number}
            </Text>
          </View>
          <AvailabilityBadge status={tap.availability_status} />
          <TemperatureDisplay
            temperatureF={tap.temperature_f}
            tempOk={tap.temp_ok}
          />
        </Animated.View>

        {/* Serving size info */}
        <Animated.View entering={FadeInDown.delay(300).duration(350)}>
          <GlassCard style={styles.sectionCard}>
            <View style={styles.servingRow}>
              <GlassWater size={18} color={colors.text.secondary} />
              <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 8 }]}>
                Serving Size
              </Text>
            </View>
            <Text style={[typography.heading, { color: colors.text.primary, marginTop: 4 }]}>
              12 oz
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Quantity stepper */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(350)}
          style={styles.section}
        >
          <Text style={[typography.overline, { color: colors.text.secondary, textAlign: 'center', marginBottom: 16 }]}>
            Quantity
          </Text>
          <QuantityStepper
            quantity={quantity}
            onDecrement={handleDecrement}
            onIncrement={handleIncrement}
          />
        </Animated.View>

        {/* Price breakdown */}
        <Animated.View entering={FadeInDown.delay(500).duration(350)}>
          <GlassCard goldAccent style={styles.sectionCard}>
            <View style={styles.priceRow}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Unit price</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                ${unitPrice.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.priceRow, { marginTop: 8 }]}>
              <Text style={[typography.label, { color: colors.text.secondary }]}>Quantity</Text>
              <Text style={[typography.label, { color: colors.text.primary }]}>
                {'\u00D7'} {quantity}
              </Text>
            </View>
            <View style={styles.goldDivider} />
            <View style={styles.priceRow}>
              <Text style={[typography.bodyMedium, { color: colors.text.primary }]}>Total</Text>
              <Text style={[typography.title, { color: colors.gold[400] }]}>
                ${totalPrice.toFixed(2)}
              </Text>
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>

      {/* Fixed CTA button at bottom */}
      <Animated.View
        entering={FadeIn.delay(600).duration(400)}
        style={[styles.ctaContainer, { paddingBottom: insets.bottom + 12 }]}
      >
        {tap.availability_status === 'low' && (
          <GlassCard style={styles.lowStockCard}>
            <View style={styles.lowStockRow}>
              <AlertTriangle size={16} color={colors.status.warning} />
              <Text style={[typography.caption, { color: colors.status.warning, marginLeft: 8, flex: 1 }]}>
                Limited stock {'\u2014'} order directly at the station
              </Text>
            </View>
          </GlassCard>
        )}
        <GoldButton
          label="Continue"
          suffix={`$${totalPrice.toFixed(2)}`}
          onPress={handleContinue}
          disabled={tap.availability_status !== 'available' || !tap.temp_ok}
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
  screenCenter: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  centered: {
    alignItems: 'center',
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.status.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
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
  imageCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: 8,
    height: 220,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    position: 'relative',
  },
  beerHeroImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlayBadge: {
    position: 'absolute',
    bottom: 12,
    left: 16,
  },
  section: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sectionGap,
  },
  sectionCard: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sectionGap,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  tapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(200,162,77,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.glass.surfaceElevated,
    borderWidth: 1.5,
    borderColor: 'rgba(200,162,77,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    borderColor: colors.glass.border,
    opacity: 0.5,
  },
  quantityContainer: {
    width: 80,
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goldDivider: {
    height: 1,
    backgroundColor: 'rgba(200,162,77,0.15)',
    marginVertical: 12,
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
  lowStockCard: {
    marginBottom: 12,
  },
  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
