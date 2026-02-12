import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Beer, ChevronRight, Clock, AlertTriangle } from 'lucide-react-native';
import { getOrderHistoryWithDetails } from '@/lib/api/orders';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import ShimmerLoader from '@/components/ui/ShimmerLoader';
import GlassCard from '@/components/ui/GlassCard';
import PremiumBadge from '@/components/ui/PremiumBadge';
import { colors, typography, radius, spacing, shadows } from '@/lib/theme';
import type { OrderWithDetails, OrderStatus } from '@/types/api';

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────
// Status badge configuration
// ─────────────────────────────────────────────────

function getStatusConfig(status: OrderStatus): {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'info';
} {
  switch (status) {
    case 'completed':
      return { label: 'Completed', variant: 'success' };
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
        variant: 'warning',
      };
    case 'expired':
    case 'cancelled':
      return {
        label: status === 'expired' ? 'Expired' : 'Cancelled',
        variant: 'danger',
      };
    case 'refunded':
      return { label: 'Refunded', variant: 'info' };
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
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
        <GlassCard style={styles.orderCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.beerName} numberOfLines={1}>
                {order.beer_name}
              </Text>
              <Text style={styles.venueName} numberOfLines={1}>
                {order.venue_name}
              </Text>
            </View>
            <PremiumBadge label={statusConfig.label} variant={statusConfig.variant} small />
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.dateRow}>
              <Clock size={12} color={colors.text.tertiary} strokeWidth={2} />
              <Text style={styles.dateText}>
                {formatDate(order.created_at)}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.quantityText}>
                {order.quantity} {'\u00D7'} 12oz
              </Text>
              <Text style={styles.totalText}>
                ${order.total_amount.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.chevronContainer}>
            <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
          </View>
        </GlassCard>
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <Text style={styles.headerSubtitle}>Your purchase history</Text>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <ShimmerLoader type="order" count={5} />
      ) : isError ? (
        <View style={styles.centered}>
          <View style={styles.errorIconWrapper}>
            <AlertTriangle size={28} color={colors.status.warning} strokeWidth={2} />
          </View>
          <Text style={styles.errorText}>
            {formatErrorMessage(error)}
          </Text>
          <Text style={styles.errorHint}>
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
            paddingBottom: insets.bottom + 80,
            ...(orders.length === 0 && { flexGrow: 1 }),
          }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading && !isFetchingNextPage}
              onRefresh={() => refetch()}
              tintColor={colors.gold[500]}
              colors={[colors.gold[500]]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.gold[500]} size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIconWrapper}>
                <Beer size={32} color={colors.gold[400]} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>
                Your order history will appear here after your first pour!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

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
  headerTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
  },
  orderCard: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.itemGap,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  beerName: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  venueName: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityText: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  totalText: {
    ...typography.label,
    color: colors.gold[400],
  },
  chevronContainer: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.status.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  errorHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200,162,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
