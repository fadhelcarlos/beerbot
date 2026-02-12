import { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/lib/theme';

/**
 * Premium shimmer loading bar with gold gradient sweep.
 */
function ShimmerBar({
  width,
  height = 16,
  borderRadius: br = 8,
  style,
}: {
  width: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const translateX = useSharedValue(-200);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(400, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          borderRadius: br,
          backgroundColor: 'rgba(255,255,255,0.04)',
          overflow: 'hidden',
        },
        typeof width === 'string' && { width: width as unknown as number },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient
          colors={[
            'rgba(200,162,77,0)',
            'rgba(200,162,77,0.08)',
            'rgba(200,162,77,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: 200, height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Venue card skeleton — matches the new hero image card layout.
 */
export function VenueCardShimmer({ index = 0 }: { index?: number }) {
  return (
    <View
      style={[
        styles.venueCard,
        { opacity: 1 - index * 0.12 },
      ]}
    >
      {/* Hero image area */}
      <ShimmerBar width="100%" height={160} borderRadius={0} />
      {/* Info strip */}
      <View style={styles.venueInfoStrip}>
        <View style={{ flex: 1 }}>
          <ShimmerBar width={180} height={14} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <ShimmerBar width={100} height={12} />
            <ShimmerBar width={40} height={12} />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Beer card skeleton — matches the new thumbnail + details layout.
 */
export function BeerCardShimmer({ index = 0 }: { index?: number }) {
  return (
    <View
      style={[styles.beerCard, { opacity: 1 - index * 0.12 }]}
    >
      {/* Thumbnail */}
      <ShimmerBar width={100} height={100} borderRadius={0} />
      {/* Details */}
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <ShimmerBar width={140} height={16} />
            <ShimmerBar width={100} height={12} style={{ marginTop: 6 }} />
          </View>
          <ShimmerBar width={50} height={18} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
          <ShimmerBar width={70} height={22} borderRadius={radius.full} />
          <ShimmerBar width={40} height={14} />
        </View>
      </View>
    </View>
  );
}

/**
 * Order card skeleton with gold shimmer.
 */
export function OrderCardShimmer({ index = 0 }: { index?: number }) {
  return (
    <View
      style={[styles.card, { opacity: 1 - index * 0.12 }]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <ShimmerBar width={140} height={18} />
          <ShimmerBar width={100} height={14} style={{ marginTop: 6 }} />
        </View>
        <ShimmerBar width={60} height={22} borderRadius={radius.full} />
      </View>
      <View style={[styles.rowSpread, { marginTop: 12 }]}>
        <ShimmerBar width={90} height={12} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShimmerBar width={50} height={12} />
          <ShimmerBar width={45} height={16} />
        </View>
      </View>
    </View>
  );
}

/**
 * Generic shimmer skeleton list.
 */
export default function ShimmerLoader({
  type = 'venue',
  count = 4,
}: {
  type?: 'venue' | 'beer' | 'order';
  count?: number;
}) {
  const Component =
    type === 'venue'
      ? VenueCardShimmer
      : type === 'beer'
        ? BeerCardShimmer
        : OrderCardShimmer;

  return (
    <View style={{ paddingTop: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: radius['2xl'],
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  venueCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: radius['2xl'],
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  venueInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  beerCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: radius['2xl'],
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
  },
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
