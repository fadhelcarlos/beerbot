import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getOrderHistoryWithDetails } from '@/lib/api/orders';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import SkeletonLoader from '@/components/SkeletonLoader';
import type { OrderWithDetails, OrderStatus } from '@/types/api';

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────
// Status badge configuration
// ─────────────────────────────────────────────────

function getStatusConfig(status: OrderStatus): {
  label: string;
  bgClass: string;
  textClass: string;
} {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        bgClass: 'bg-green-500/20',
        textClass: 'text-green-400',
      };
    case 'paid':
    case 'ready_to_redeem':
    case 'redeemed':
    case 'pouring':
    case 'pending_payment':
      return {
        label: status === 'pending_payment'
          ? 'Pending'
          : status === 'paid'
            ? 'Paid'
            : status === 'ready_to_redeem'
              ? 'Ready'
              : status === 'redeemed'
                ? 'Redeemed'
                : 'Pouring',
        bgClass: 'bg-yellow-500/20',
        textClass: 'text-yellow-400',
      };
    case 'expired':
    case 'cancelled':
      return {
        label: status === 'expired' ? 'Expired' : 'Cancelled',
        bgClass: 'bg-red-500/20',
        textClass: 'text-red-400',
      };
    case 'refunded':
      return {
        label: 'Refunded',
        bgClass: 'bg-blue-500/20',
        textClass: 'text-blue-400',
      };
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `${date.toLocaleDateString([], { weekday: 'short' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ─────────────────────────────────────────────────
// Order Card
// ─────────────────────────────────────────────────

function OrderCard({
  order,
  onPress,
  index,
}: {
  order: OrderWithDetails;
  onPress: () => void;
  index: number;
}) {
  const statusConfig = getStatusConfig(order.status);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 50).duration(350)}>
      <Pressable
        onPress={onPress}
        className="mx-4 mb-3 rounded-2xl p-4 bg-dark-700 border border-dark-600 active:opacity-80"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-base font-bold text-white" numberOfLines={1}>
              {order.beer_name}
            </Text>
            <Text className="text-sm text-white/50 mt-0.5" numberOfLines={1}>
              {order.venue_name}
            </Text>
          </View>

          {/* Status badge */}
          <View className={`${statusConfig.bgClass} rounded-full px-2.5 py-0.5`}>
            <Text className={`text-xs font-semibold ${statusConfig.textClass}`}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Date, quantity, total row */}
        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-xs text-white/40">
            {formatDate(order.created_at)}
          </Text>
          <View className="flex-row items-center gap-3">
            <Text className="text-xs text-white/40">
              {order.quantity} {'\u00D7'} 12oz
            </Text>
            <Text className="text-sm font-semibold text-brand">
              ${order.total_amount.toFixed(2)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ['order-history'],
    queryFn: ({ pageParam }) =>
      getOrderHistoryWithDetails({ pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((total, page) => total + page.length, 0);
    },
    staleTime: 1000 * 30,
  });

  const orders = useMemo(
    () => data?.pages.flat() ?? [],
    [data?.pages],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleOrderPress = useCallback(
    (orderId: string) => {
      router.push({
        pathname: '/(main)/orders/[id]',
        params: { id: orderId },
      });
    },
    [router],
  );

  const renderOrderCard = useCallback(
    ({ item, index }: { item: OrderWithDetails; index: number }) => (
      <OrderCard
        order={item}
        index={index}
        onPress={() => handleOrderPress(item.id)}
      />
    ),
    [handleOrderPress],
  );

  const keyExtractor = useCallback((item: OrderWithDetails) => item.id, []);

  return (
    <View
      className="flex-1 bg-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-white">Orders</Text>
        <Text className="text-sm text-white/50 mt-1">
          Your purchase history
        </Text>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <SkeletonLoader type="order" count={5} />
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-3xl mb-3">{'\u26A0\uFE0F'}</Text>
          <Text className="text-white/70 text-base text-center">
            {formatErrorMessage(error)}
          </Text>
          <Text className="text-white/40 text-sm text-center mt-2">
            Pull down to try again
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderCard}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: insets.bottom + 24,
            ...(orders.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading && !isFetchingNextPage}
              onRefresh={() => refetch()}
              tintColor="#f59e0b"
              colors={['#f59e0b']}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#f59e0b" size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-4xl mb-4">{'\uD83C\uDF7B'}</Text>
              <Text className="text-white/70 text-base text-center">
                Your order history will appear here after your first pour!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
