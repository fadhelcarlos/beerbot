import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  AlertTriangle,
  QrCode,
  RefreshCw,
  FileText,
  CreditCard,
  Scan,
  GlassWater,
  PartyPopper,
  Timer,
  CircleDollarSign,
  ExternalLink,
  CircleDot,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react-native';
import {
  getOrderWithDetails,
  getOrderEvents,
  checkTapAvailability,
} from '@/lib/api/orders';
import GlassCard from '@/components/ui/GlassCard';
import GoldButton from '@/components/ui/GoldButton';
import PremiumBadge from '@/components/ui/PremiumBadge';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  goldGradientButton,
} from '@/lib/theme';
import type { OrderStatus, OrderEvent } from '@/types/api';

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

function getEventIcon(eventType: string) {
  if (eventType === 'created') return FileText;
  if (eventType.includes('payment') && eventType.includes('succeeded')) return CheckCircle2;
  if (eventType.includes('payment') && eventType.includes('failed')) return XCircle;
  if (eventType.includes('payment_intent_created')) return CreditCard;
  if (eventType.includes('qr')) return QrCode;
  if (eventType === 'redeemed') return Scan;
  if (eventType === 'pouring') return GlassWater;
  if (eventType === 'completed') return PartyPopper;
  if (eventType === 'expired') return Timer;
  if (eventType.includes('refund')) return CircleDollarSign;
  return CircleDot;
}

function getEventIconColor(eventType: string): string {
  if (eventType.includes('succeeded') || eventType === 'completed') return colors.status.success;
  if (eventType.includes('failed') || eventType === 'refund_failed') return colors.status.danger;
  if (eventType === 'expired') return colors.status.danger;
  if (eventType.includes('refund')) return colors.status.info;
  return colors.gold[400];
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
  const paymentEvent = events.find(
    (e) => e.event_type === 'stripe_payment_intent.succeeded',
  );
  const metadata = paymentEvent?.metadata;

  if (metadata) {
    const walletType = metadata.wallet_type as string | undefined;
    if (walletType === 'apple_pay') return 'Apple Pay';
    if (walletType === 'google_pay') return 'Google Pay';

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

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, accent && styles.infoValueAccent]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
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
  const IconComponent = getEventIcon(event.event_type);
  const iconColor = getEventIconColor(event.event_type);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
      style={styles.timelineRow}
    >
      {/* Timeline connector */}
      <View style={styles.timelineIconCol}>
        <View style={[styles.timelineIconCircle, { backgroundColor: `${iconColor}15` }]}>
          <IconComponent size={14} color={iconColor} strokeWidth={2} />
        </View>
        {!isLast && <View style={styles.timelineConnector} />}
      </View>

      {/* Event content */}
      <View style={[styles.timelineContent, !isLast && { paddingBottom: 16 }]}>
        <Text style={styles.timelineLabel}>
          {getEventDisplayName(event.event_type)}
        </Text>
        <Text style={styles.timelineTime}>
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
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.gold[500]} size="large" />
        <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading order...</Text>
      </View>
    );
  }

  // ─── Error / Not Found ───

  if (!order) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.errorIconWrapper}>
          <AlertTriangle size={28} color={colors.status.warning} strokeWidth={2} />
        </View>
        <Text style={styles.errorMainText}>Order not found.</Text>
        <GoldButton
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
          fullWidth={false}
          style={{ marginTop: 24, paddingHorizontal: 32 }}
        />
      </View>
    );
  }

  const statusConfig = getStatusConfig(order.status);
  const isActive = isActiveOrder(order.status);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={16}
        >
          <ArrowLeft size={20} color={colors.gold[400]} strokeWidth={2} />
          <Text style={styles.backText}>Orders</Text>
        </Pressable>

        {/* Header: Beer name + status */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.detailHeader}>
          <View style={styles.detailHeaderLeft}>
            <Text style={styles.detailBeerName}>{order.beer_name}</Text>
            <Text style={styles.detailBeerStyle}>
              {order.beer_style} {'\u00B7'} {order.beer_abv}% ABV
            </Text>
          </View>
          <PremiumBadge label={statusConfig.label} variant={statusConfig.variant} />
        </Animated.View>

        {/* Active order CTA: show QR + go to redeem */}
        {isActive && (
          <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.sectionWrapper}>
            <Pressable
              onPress={handleGoToRedeem}
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <LinearGradient
                colors={goldGradientButton.colors as unknown as [string, string, ...string[]]}
                start={goldGradientButton.start}
                end={goldGradientButton.end}
                style={[styles.qrCta, shadows.glow]}
              >
                <QrCode size={24} color={colors.bg.primary} strokeWidth={2} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.qrCtaTitle}>Show QR Code</Text>
                  <Text style={styles.qrCtaSubtitle}>
                    Tap to view QR code and countdown
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        {/* Order details card */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)} style={styles.sectionWrapper}>
          <GlassCard>
            <SectionTitle title="Order Details" />
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
              accent
            />
          </GlassCard>
        </Animated.View>

        {/* Payment info card */}
        {order.paid_at && (
          <Animated.View entering={FadeInDown.delay(180).duration(350)} style={styles.sectionWrapperSmall}>
            <GlassCard>
              <SectionTitle title="Payment" />
              <InfoRow label="Method" value={paymentMethod} />
              <Divider />
              <InfoRow label="Paid" value={new Date(order.paid_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />

              {receiptUrl && (
                <>
                  <Divider />
                  <Pressable
                    onPress={handleViewReceipt}
                    style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.infoLabel}>Stripe Receipt</Text>
                    <View style={styles.receiptLink}>
                      <Text style={styles.receiptLinkText}>View</Text>
                      <ExternalLink size={13} color={colors.gold[400]} strokeWidth={2} />
                    </View>
                  </Pressable>
                </>
              )}
            </GlassCard>
          </Animated.View>
        )}

        {/* Order timeline */}
        <Animated.View entering={FadeInDown.delay(240).duration(350)} style={styles.sectionWrapper}>
          <GlassCard>
            <SectionTitle title="Timeline" />

            {eventsQuery.isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <ActivityIndicator color={colors.gold[500]} size="small" />
              </View>
            ) : events.length === 0 ? (
              <Text style={styles.emptyTimeline}>
                No timeline events yet
              </Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {events.map((event, index) => (
                  <TimelineItem
                    key={event.id}
                    event={event}
                    isLast={index === events.length - 1}
                    index={index}
                  />
                ))}
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* Timestamps card */}
        <Animated.View entering={FadeInDown.delay(300).duration(350)} style={styles.sectionWrapperSmall}>
          <GlassCard>
            <SectionTitle title="Timestamps" />
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
          </GlassCard>
        </Animated.View>

        {/* Reorder button */}
        {!isActive && canReorder && (
          <Animated.View entering={FadeInDown.delay(360).duration(350)} style={styles.sectionWrapper}>
            <GoldButton
              label="Reorder This Beer"
              onPress={handleReorder}
              disabled={reorderLoading}
              loading={reorderLoading}
            />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding + 4,
    paddingTop: 16,
    paddingBottom: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  backText: {
    ...typography.label,
    color: colors.gold[400],
  },
  detailHeader: {
    paddingHorizontal: spacing.screenPadding + 4,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  detailHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  detailBeerName: {
    ...typography.title,
    color: colors.text.primary,
  },
  detailBeerStyle: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
  },
  sectionWrapper: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sectionGap,
  },
  sectionWrapperSmall: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.itemGap,
  },
  qrCta: {
    borderRadius: radius['2xl'],
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrCtaTitle: {
    ...typography.buttonLarge,
    color: colors.bg.primary,
  },
  qrCtaSubtitle: {
    ...typography.caption,
    color: 'rgba(8,8,15,0.6)',
    marginTop: 2,
    fontSize: 12,
  },
  sectionTitle: {
    ...typography.overline,
    color: colors.text.tertiary,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  infoValue: {
    ...typography.label,
    color: colors.text.primary,
  },
  infoValueAccent: {
    color: colors.gold[400],
    fontFamily: 'Inter_700Bold',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.glass.border,
  },
  receiptLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  receiptLinkText: {
    ...typography.label,
    color: colors.gold[400],
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineIconCol: {
    alignItems: 'center',
    marginRight: 12,
    width: 28,
  },
  timelineIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineConnector: {
    width: 1.5,
    flex: 1,
    backgroundColor: colors.glass.border,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 4,
  },
  timelineLabel: {
    ...typography.label,
    color: colors.text.primary,
  },
  timelineTime: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: 2,
    fontSize: 12,
  },
  emptyTimeline: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    ...typography.caption,
    color: colors.text.tertiary,
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
  errorMainText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
