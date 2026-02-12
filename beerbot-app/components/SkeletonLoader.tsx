import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * A single skeleton placeholder bar with a pulsing animation.
 */
function SkeletonBar({
  width,
  height = 16,
  borderRadius = 8,
}: {
  width: number | string;
  height?: number;
  borderRadius?: number;
}) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          borderRadius,
          backgroundColor: '#3d3d77',
        },
        typeof width === 'string' && { width: width as unknown as number },
        animatedStyle,
      ]}
      className={typeof width === 'string' ? `w-[${width}]` : ''}
    />
  );
}

/**
 * Skeleton placeholder for a venue card in the venue list.
 */
export function VenueCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <View
      className="mx-4 mb-3 rounded-2xl p-4 bg-dark-700 border border-dark-600"
      style={{ opacity: 1 - index * 0.15 }}
    >
      <SkeletonBar width={300} height={112} borderRadius={12} />
      <View className="mt-3 flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <SkeletonBar width={180} height={20} />
          <View className="mt-2">
            <SkeletonBar width={140} height={14} />
          </View>
        </View>
        <SkeletonBar width={70} height={24} borderRadius={12} />
      </View>
      <View className="flex-row items-center mt-2">
        <SkeletonBar width={60} height={12} />
      </View>
    </View>
  );
}

/**
 * Skeleton placeholder for a beer card in the beer list.
 */
export function BeerCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <View
      className="mx-4 mb-3 rounded-2xl p-4 bg-dark-700 border border-dark-600"
      style={{ opacity: 1 - index * 0.15 }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <SkeletonBar width={160} height={20} />
          <View className="mt-1.5">
            <SkeletonBar width={120} height={14} />
          </View>
        </View>
        <SkeletonBar width={50} height={20} />
      </View>
      <View className="flex-row items-center mt-3 gap-2">
        <SkeletonBar width={70} height={22} borderRadius={11} />
        <SkeletonBar width={40} height={14} />
      </View>
    </View>
  );
}

/**
 * Skeleton placeholder for an order card in the order history.
 */
export function OrderCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <View
      className="mx-4 mb-3 rounded-2xl p-4 bg-dark-700 border border-dark-600"
      style={{ opacity: 1 - index * 0.15 }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <SkeletonBar width={140} height={18} />
          <View className="mt-1.5">
            <SkeletonBar width={100} height={14} />
          </View>
        </View>
        <SkeletonBar width={60} height={22} borderRadius={11} />
      </View>
      <View className="flex-row items-center justify-between mt-3">
        <SkeletonBar width={90} height={12} />
        <View className="flex-row items-center gap-3">
          <SkeletonBar width={50} height={12} />
          <SkeletonBar width={45} height={16} />
        </View>
      </View>
    </View>
  );
}

/**
 * Generic skeleton list — renders multiple skeleton cards of the specified type.
 */
export default function SkeletonLoader({
  type = 'venue',
  count = 4,
}: {
  type?: 'venue' | 'beer' | 'order';
  count?: number;
}) {
  const Component =
    type === 'venue'
      ? VenueCardSkeleton
      : type === 'beer'
        ? BeerCardSkeleton
        : OrderCardSkeleton;

  return (
    <View className="pt-2">
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} index={i} />
      ))}
    </View>
  );
}
