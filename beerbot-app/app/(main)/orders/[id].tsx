import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import {
  getOrderWithDetails,
  getOrderEvents,
  checkTapAvailability,
} from '@/lib/api/orders';
import type { OrderStatus, OrderEvent } from '@/types/api';

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
      return { label: 'Completed', bgClass: 'bg-green-500/20', textClass: 'text-green-400' };
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
      return { label: 'Refunded', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' };
  }
}

// ─────────────────────────────────────────────────
// Active order statuses (eligible for QR/redeem)
// ─────────────────────────────────────────────────

const ACTIVE_STATUSES: OrderStatus[] = ['paid', 'ready_to_redeem'];

function isActiveOrder(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

// ─────────────────────────────────────────────────
// Timeline event helpers
// ─────────────────────────────────────────────────

function getEventDisplayName(eventType: string): string {
  const map: Record<string, string> = {
    created: 'Order Created',
    payment_intent_created: 'Payment Initiated',
    'stripe_payment_intent.succeeded': 'Payment Successful',
    'stripe_payment_intent.payment_failed': 'Payment Failed',
    qr_token_generated: 'QR Code Generated',
    redeemed: 'QR Code Scanned',
    pouring: 'Pouring Started',
    completed: 'Order Completed',
    expired: 'Order Expired',
    'stripe_charge.refunded': 'Refund Processed',
    refunded: 'Refund Processed',
    refund_failed: 'Refund Failed',
  };
  return map[eventType] ?? eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventIcon(eventType: string): string {
  if (eventType === 'created') return '\uD83D\uDCDD';
  if (eventType.includes('payment') && eventType.includes('succeeded')) return '\u2705';
  if (eventType.includes('payment') && eventType.includes('failed')) return '\u274C';
  if (eventType.includes('payment_intent_created')) return '\uD83D\uDCB3';
  if (eventType.includes('qr')) return '\uD83D\uDCF1';
  if (eventType === 'redeemed') return '\uD83D\uDD0D';
  if (eventType === 'pouring') return '\uD83C\uDF7A';
  if (eventType === 'completed') return '\uD83C\uDF89';
  if (eventType === 'expired') return '\u23F0';
  if (eventType.includes('refund')) return '\uD83D\uDCB0';
  return '\u25CF';
}

function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────
// Payment info helpers
// ─────────────────────────────────────────────────

function getPaymentMethodDisplay(events: OrderEvent[]): string {
  // Look for payment succeeded event metadata
  const paymentEvent = events.find(
    (e) => e.event_type === 'stripe_payment_intent.succeeded',
  );
  const metadata = paymentEvent?.metadata;

  if (metadata) {
    // Check for wallet type in metadata
    const walletType = metadata.wallet_type as string | undefined;
    if (walletType === 'apple_pay') return 'Apple Pay';
    if (walletType === 'google_pay') return 'Google Pay';

    // Check for last4 digits
    const last4 = metadata.last4 as string | undefined;
    if (last4) return `Card ending ${last4}`;

    const brand = metadata.card_brand as string | undefined;
    if (brand) return `${brand.charAt(0).toUpperCase() + brand.slice(1)} card`;
  }

  return 'Card payment';
}

function getReceiptUrl(events: OrderEvent[]): string | null {
  const paymentEvent = events.find(
    (e) => e.event_type === 'stripe_payment_intent.succeeded',
  );
  return (paymentEvent?.metadata?.receipt_url as string) ?? null;
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <View className="flex-row justify-between items-center py-2.5">
      <Text className="text-sm text-white/50">{label}</Text>
      <Text className={`text-sm font-medium ${valueClass ?? 'text-white/80'}`}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-dark-600" />;
}

function TimelineItem({
  event,
  isLast,
  index,
}: {
  event: OrderEvent;
  isLast: boolean;
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
      className="flex-row"
    >
      {/* Timeline connector */}
      <View className="items-center mr-3 w-8">
        <Text className="text-lg">{getEventIcon(event.event_type)}</Text>
        {!isLast && <View className="w-0.5 flex-1 bg-dark-600 mt-1" />}
      </View>

      {/* Event content */}
      <View className={`flex-1 ${isLast ? '' : 'pb-4'}`}>
        <Text className="text-sm font-semibold text-white">
          {getEventDisplayName(event.event_type)}
        </Text>
        <Text className="text-xs text-white/40 mt-0.5">
          {formatEventTime(event.created_at)}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reorderLoading, setReorderLoading] = useState(false);

  // Fetch order with joined data
  const orderQuery = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => getOrderWithDetails(id!),
    enabled: !!id,
  });

  // Fetch order events for timeline
  const eventsQuery = useQuery({
    queryKey: ['order-events', id],
    queryFn: () => getOrderEvents(id!),
    enabled: !!id,
  });

  // Check tap availability for reorder button
  const tapAvailableQuery = useQuery({
    queryKey: ['tap-available', orderQuery.data?.tap_id, orderQuery.data?.beer_id],
    queryFn: () =>
      checkTapAvailability(orderQuery.data!.tap_id, orderQuery.data!.beer_id),
    enabled: !!orderQuery.data && !isActiveOrder(orderQuery.data.status),
  });

  const order = orderQuery.data;
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const canReorder = tapAvailableQuery.data === true;

  const paymentMethod = useMemo(
    () => getPaymentMethodDisplay(events),
    [events],
  );

  const receiptUrl = useMemo(() => getReceiptUrl(events), [events]);

  const handleViewReceipt = useCallback(() => {
    if (receiptUrl) {
      Linking.openURL(receiptUrl);
    }
  }, [receiptUrl]);

  const handleReorder = useCallback(() => {
    if (!order) return;
    setReorderLoading(true);
    router.push({
      pathname: '/(main)/order/configure',
      params: { tapId: order.tap_id, venueId: order.venue_id },
    });
  }, [order, router]);

  const handleGoToRedeem = useCallback(() => {
    if (!order) return;
    router.push({
      pathname: '/(main)/order/redeem',
      params: { orderId: order.id },
    });
  }, [order, router]);

  // ─── Loading State ───

  if (orderQuery.isLoading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">Loading order...</Text>
      </View>
    );
  }

  // ─── Error / Not Found ───

  if (!order) {
    return (
      <View className="flex-1 bg-dark items-center justify-center px-8" style={{ paddingTop: insets.top }}>
        <Text className="text-3xl mb-3">{'\u26A0\uFE0F'}</Text>
        <Text className="text-white/70 text-base text-center">Order not found.</Text>
        <Pressable onPress={() => router.back()} className="mt-6 bg-dark-600 rounded-full px-6 py-3 active:opacity-70">
          <Text className="text-brand font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  const statusConfig = getStatusConfig(order.status);
  const isActive = isActiveOrder(order.status);

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          className="px-6 pt-4 pb-2 self-start active:opacity-60"
          hitSlop={16}
        >
          <Text className="text-brand text-base">{'\u2190'} Orders</Text>
        </Pressable>

        {/* Header: Beer name + status */}
        <Animated.View entering={FadeIn.duration(400)} className="px-6 mt-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-2xl font-bold text-white">{order.beer_name}</Text>
              <Text className="text-sm text-white/50 mt-1">
                {order.beer_style} {'\u00B7'} {order.beer_abv}% ABV
              </Text>
            </View>
            <View className={`${statusConfig.bgClass} rounded-full px-3 py-1 mt-1`}>
              <Text className={`text-sm font-semibold ${statusConfig.textClass}`}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Active order CTA: show QR + go to redeem */}
        {isActive && (
          <Animated.View entering={FadeInDown.delay(80).duration(350)} className="mx-6 mt-5">
            <Pressable
              onPress={handleGoToRedeem}
              className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
            >
              <Text className="text-lg font-bold text-dark">
                {'\uD83D\uDCF1'} Show QR Code
              </Text>
              <Text className="text-xs text-dark/70 mt-0.5">
                Tap to view QR code and countdown
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Order details card */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(350)}
          className="mx-6 mt-5 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1">
            Order Details
          </Text>

          <InfoRow label="Venue" value={order.venue_name} />
          <Divider />
          <InfoRow label="Tap" value={`#${order.tap_number}`} />
          <Divider />
          <InfoRow label="Quantity" value={`${order.quantity} \u00D7 ${order.pour_size_oz}oz`} />
          <Divider />
          <InfoRow label="Unit Price" value={`$${order.unit_price.toFixed(2)}`} />
          <Divider />
          <InfoRow
            label="Total"
            value={`$${order.total_amount.toFixed(2)}`}
            valueClass="text-brand font-bold"
          />
        </Animated.View>

        {/* Payment info card */}
        {order.paid_at && (
          <Animated.View
            entering={FadeInDown.delay(180).duration(350)}
            className="mx-6 mt-3 bg-dark-700 rounded-2xl p-5 border border-dark-600"
          >
            <Text className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1">
              Payment
            </Text>

            <InfoRow label="Method" value={paymentMethod} />
            <Divider />
            <InfoRow label="Paid" value={new Date(order.paid_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />

            {receiptUrl && (
              <>
                <Divider />
                <Pressable
                  onPress={handleViewReceipt}
                  className="flex-row justify-between items-center py-2.5 active:opacity-60"
                >
                  <Text className="text-sm text-white/50">Stripe Receipt</Text>
                  <Text className="text-sm font-medium text-brand">
                    View {'\u2197'}
                  </Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        )}

        {/* Order timeline */}
        <Animated.View
          entering={FadeInDown.delay(240).duration(350)}
          className="mx-6 mt-5 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-4">
            Timeline
          </Text>

          {eventsQuery.isLoading ? (
            <View className="items-center py-4">
              <ActivityIndicator color="#f59e0b" size="small" />
            </View>
          ) : events.length === 0 ? (
            <Text className="text-sm text-white/40 text-center py-3">
              No timeline events yet
            </Text>
          ) : (
            events.map((event, index) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
                index={index}
              />
            ))
          )}
        </Animated.View>

        {/* Timestamps card */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(350)}
          className="mx-6 mt-3 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-1">
            Timestamps
          </Text>

          <InfoRow
            label="Created"
            value={new Date(order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          />
          {order.paid_at && (
            <>
              <Divider />
              <InfoRow
                label="Paid"
                value={new Date(order.paid_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              />
            </>
          )}
          {order.redeemed_at && (
            <>
              <Divider />
              <InfoRow
                label="Redeemed"
                value={new Date(order.redeemed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              />
            </>
          )}
          {order.completed_at && (
            <>
              <Divider />
              <InfoRow
                label="Completed"
                value={new Date(order.completed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              />
            </>
          )}
          {order.expires_at && (
            <>
              <Divider />
              <InfoRow
                label="Expires"
                value={new Date(order.expires_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              />
            </>
          )}

          <Divider />
          <InfoRow
            label="Order ID"
            value={order.id.slice(0, 8) + '...'}
          />
        </Animated.View>

        {/* Reorder button */}
        {!isActive && canReorder && (
          <Animated.View entering={FadeInDown.delay(360).duration(350)} className="mx-6 mt-5">
            <Pressable
              onPress={handleReorder}
              disabled={reorderLoading}
              className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
            >
              {reorderLoading ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text className="text-lg font-bold text-dark">
                  {'\uD83D\uDD01'} Reorder This Beer
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
