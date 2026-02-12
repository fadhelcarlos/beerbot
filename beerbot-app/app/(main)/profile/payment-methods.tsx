import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  initPaymentSheet,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import {
  ArrowLeft,
  CreditCard,
  Trash2,
  Star,
  AlertTriangle,
  Plus,
} from 'lucide-react-native';

import {
  listPaymentMethods,
  detachPaymentMethod,
  setDefaultPaymentMethod,
  createSetupIntent,
} from '@/lib/api/payment-methods';
import GlassCard from '@/components/ui/GlassCard';
import GoldButton from '@/components/ui/GoldButton';
import PremiumBadge from '@/components/ui/PremiumBadge';
import { colors, typography, radius, spacing, shadows } from '@/lib/theme';
import type { SavedPaymentMethod } from '@/types/api';

// ─────────────────────────────────────────────────
// Card Brand Display
// ─────────────────────────────────────────────────

const BRAND_DISPLAY: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
};

function getBrandLabel(brand: string): string {
  return BRAND_DISPLAY[brand.toLowerCase()] ?? BRAND_DISPLAY.unknown;
}

// ─────────────────────────────────────────────────
// Payment Method Card
// ─────────────────────────────────────────────────

function PaymentMethodCard({
  method,
  onDelete,
  onSetDefault,
  isDeleting,
  isSettingDefault,
}: {
  method: SavedPaymentMethod;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  isDeleting: boolean;
  isSettingDefault: boolean;
}) {
  const brandLabel = getBrandLabel(method.brand);
  const expiry = `${String(method.exp_month).padStart(2, '0')}/${String(method.exp_year).slice(-2)}`;

  return (
    <GlassCard
      goldAccent={method.is_default}
      style={styles.paymentCard}
    >
      <View style={styles.cardRow}>
        <View style={[styles.cardIconCircle, method.is_default && styles.cardIconCircleDefault]}>
          <CreditCard
            size={20}
            color={method.is_default ? colors.gold[400] : colors.text.secondary}
            strokeWidth={1.8}
          />
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>
              {brandLabel} {'\u2022\u2022\u2022\u2022'} {method.last4}
            </Text>
            {method.is_default ? (
              <PremiumBadge label="Default" variant="gold" small />
            ) : null}
          </View>
          <Text style={styles.cardExpiry}>Expires {expiry}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        {!method.is_default ? (
          <Pressable
            onPress={() => onSetDefault(method.id)}
            disabled={isSettingDefault}
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnDefault, pressed && { opacity: 0.7 }]}
          >
            {isSettingDefault ? (
              <ActivityIndicator color={colors.gold[500]} size="small" />
            ) : (
              <>
                <Star size={14} color={colors.gold[400]} strokeWidth={2} />
                <Text style={styles.actionBtnDefaultText}>Set as Default</Text>
              </>
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onDelete(method.id)}
          disabled={isDeleting}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnDanger,
            method.is_default && { flex: 1 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {isDeleting ? (
            <ActivityIndicator color={colors.status.danger} size="small" />
          ) : (
            <>
              <Trash2 size={14} color={colors.status.danger} strokeWidth={2} />
              <Text style={styles.actionBtnDangerText}>Remove</Text>
            </>
          )}
        </Pressable>
      </View>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);

  // Fetch saved payment methods
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: listPaymentMethods,
    staleTime: 1000 * 30,
  });

  const paymentMethods = data?.payment_methods ?? [];

  // ─── Delete mutation ───
  const deleteMutation = useMutation({
    mutationFn: detachPaymentMethod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      setActionTargetId(null);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to remove payment method. Please try again.');
      setActionTargetId(null);
    },
  });

  // ─── Set default mutation ───
  const setDefaultMutation = useMutation({
    mutationFn: setDefaultPaymentMethod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      setActionTargetId(null);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to set default payment method. Please try again.');
      setActionTargetId(null);
    },
  });

  // ─── Handle delete with confirmation ───
  const handleDelete = useCallback(
    (paymentMethodId: string) => {
      Alert.alert(
        'Remove Card',
        'Are you sure you want to remove this payment method?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setActionTargetId(paymentMethodId);
              deleteMutation.mutate(paymentMethodId);
            },
          },
        ],
      );
    },
    [deleteMutation],
  );

  // ─── Handle set default ───
  const handleSetDefault = useCallback(
    (paymentMethodId: string) => {
      setActionTargetId(paymentMethodId);
      setDefaultMutation.mutate(paymentMethodId);
    },
    [setDefaultMutation],
  );

  // ─── Handle add new card ───
  const handleAddCard = useCallback(async () => {
    setIsAddingCard(true);
    try {
      const setupData = await createSetupIntent();

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: setupData.setup_intent_client_secret,
        customerEphemeralKeySecret: setupData.ephemeral_key,
        customerId: setupData.customer_id,
        merchantDisplayName: 'BeerBot',
        returnURL: 'beerbot://payment-methods',
        style: 'alwaysDark',
      });

      if (initError) {
        throw initError;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          return;
        }
        throw presentError;
      }

      await queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    } catch {
      Alert.alert('Error', 'Failed to add payment method. Please try again.');
    } finally {
      setIsAddingCard(false);
    }
  }, [queryClient]);

  // ─── Render card item ───
  const renderItem = useCallback(
    ({ item, index }: { item: SavedPaymentMethod; index: number }) => (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(300)}>
        <PaymentMethodCard
          method={item}
          onDelete={handleDelete}
          onSetDefault={handleSetDefault}
          isDeleting={
            deleteMutation.isPending && actionTargetId === item.id
          }
          isSettingDefault={
            setDefaultMutation.isPending && actionTargetId === item.id
          }
        />
      </Animated.View>
    ),
    [handleDelete, handleSetDefault, deleteMutation.isPending, setDefaultMutation.isPending, actionTargetId],
  );

  const keyExtractor = useCallback((item: SavedPaymentMethod) => item.id, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View
        entering={FadeIn.duration(400)}
        style={styles.headerRow}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <ArrowLeft size={20} color={colors.gold[400]} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.gold[500]} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <View style={styles.errorIconWrapper}>
            <AlertTriangle size={28} color={colors.status.warning} strokeWidth={2} />
          </View>
          <Text style={styles.errorText}>
            Failed to load payment methods. Pull to refresh.
          </Text>
        </View>
      ) : (
        <FlatList
          data={paymentMethods}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: insets.bottom + 100,
            ...(paymentMethods.length === 0 ? { flexGrow: 1 } : {}),
          }}
          showsVerticalScrollIndicator={false}
          refreshing={false}
          onRefresh={refetch}
          ListEmptyComponent={
            <Animated.View
              entering={FadeIn.delay(100).duration(400)}
              style={styles.centered}
            >
              <View style={styles.emptyIconWrapper}>
                <CreditCard size={32} color={colors.gold[400]} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyText}>
                No saved payment methods.{'\n'}Add one for faster checkout.
              </Text>
            </Animated.View>
          }
        />
      )}

      {/* Add Card Button -- fixed at bottom */}
      <Animated.View
        entering={FadeInDown.delay(200).duration(350)}
        style={[styles.bottomAction, { bottom: insets.bottom + 68 }]}
      >
        <GoldButton
          label="Add Payment Method"
          onPress={handleAddCard}
          loading={isAddingCard}
          disabled={isAddingCard}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  paymentCard: {
    marginHorizontal: spacing.screenPadding,
    marginBottom: spacing.itemGap,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.glass.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconCircleDefault: {
    backgroundColor: 'rgba(200,162,77,0.12)',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  cardExpiry: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: 2,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glass.border,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: 10,
    gap: 6,
  },
  actionBtnDefault: {
    backgroundColor: colors.glass.surfaceElevated,
  },
  actionBtnDefaultText: {
    ...typography.buttonSmall,
    color: colors.text.primary,
  },
  actionBtnDanger: {
    backgroundColor: colors.status.dangerMuted,
  },
  actionBtnDangerText: {
    ...typography.buttonSmall,
    color: colors.status.danger,
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
    lineHeight: 24,
  },
  bottomAction: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 8,
  },
});
