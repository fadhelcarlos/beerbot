import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
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
  listPaymentMethods,
  detachPaymentMethod,
  setDefaultPaymentMethod,
  createSetupIntent,
} from '@/lib/api/payment-methods';
import type { SavedPaymentMethod } from '@/types/api';

// ─────────────────────────────────────────────────
// Card Brand Icons (text-based for simplicity)
// ─────────────────────────────────────────────────

const BRAND_DISPLAY: Record<string, { icon: string; label: string }> = {
  visa: { icon: '\uD83D\uDCB3', label: 'Visa' },
  mastercard: { icon: '\uD83D\uDCB3', label: 'Mastercard' },
  amex: { icon: '\uD83D\uDCB3', label: 'Amex' },
  discover: { icon: '\uD83D\uDCB3', label: 'Discover' },
  diners: { icon: '\uD83D\uDCB3', label: 'Diners' },
  jcb: { icon: '\uD83D\uDCB3', label: 'JCB' },
  unionpay: { icon: '\uD83D\uDCB3', label: 'UnionPay' },
  unknown: { icon: '\uD83D\uDCB3', label: 'Card' },
};

function getBrandDisplay(brand: string) {
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
  const brandInfo = getBrandDisplay(method.brand);
  const expiry = `${String(method.exp_month).padStart(2, '0')}/${String(method.exp_year).slice(-2)}`;

  return (
    <View
      className={`mx-4 mb-3 rounded-2xl bg-dark-700 border ${
        method.is_default ? 'border-brand' : 'border-dark-600'
      } p-4`}
    >
      <View className="flex-row items-center">
        {/* Card icon and brand */}
        <Text className="text-2xl mr-3">{brandInfo.icon}</Text>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-white font-semibold text-base">
              {brandInfo.label} {'\u2022\u2022\u2022\u2022'} {method.last4}
            </Text>
            {method.is_default ? (
              <View className="ml-2 bg-brand/20 rounded-full px-2 py-0.5">
                <Text className="text-brand text-xs font-bold">Default</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-white/40 text-sm mt-0.5">
            Expires {expiry}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row mt-3 pt-3 border-t border-dark-600 gap-3">
        {!method.is_default ? (
          <Pressable
            onPress={() => onSetDefault(method.id)}
            disabled={isSettingDefault}
            className="flex-1 bg-dark-600 rounded-xl py-2.5 items-center active:opacity-80"
          >
            {isSettingDefault ? (
              <ActivityIndicator color="#f59e0b" size="small" />
            ) : (
              <Text className="text-white text-sm font-semibold">
                Set as Default
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onDelete(method.id)}
          disabled={isDeleting}
          className={`${method.is_default ? 'flex-1' : ''} bg-red-500/15 rounded-xl py-2.5 px-4 items-center active:opacity-80`}
        >
          {isDeleting ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text className="text-red-400 text-sm font-semibold">Remove</Text>
          )}
        </Pressable>
      </View>
    </View>
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

      // Card saved successfully — refresh the list
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
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <Animated.View
        entering={FadeIn.duration(400)}
        className="flex-row items-center px-4 pt-4 pb-3"
      >
        <Pressable
          onPress={() => router.back()}
          className="mr-3 w-9 h-9 rounded-full bg-dark-700 items-center justify-center active:opacity-70"
        >
          <Text className="text-white text-lg">{'\u2039'}</Text>
        </Pressable>
        <Text className="text-xl font-bold text-white flex-1">
          Payment Methods
        </Text>
      </Animated.View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#f59e0b" size="large" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-3">{'\u26A0\uFE0F'}</Text>
          <Text className="text-white/60 text-center text-base">
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
              className="flex-1 items-center justify-center px-8"
            >
              <Text className="text-5xl mb-4">{'\uD83D\uDCB3'}</Text>
              <Text className="text-white/50 text-center text-base leading-6">
                No saved payment methods.{'\n'}Add one for faster checkout.
              </Text>
            </Animated.View>
          }
        />
      )}

      {/* Add Card Button — fixed at bottom */}
      <Animated.View
        entering={FadeInDown.delay(200).duration(350)}
        className="absolute left-0 right-0 px-4 pb-2"
        style={{ bottom: insets.bottom + 8 }}
      >
        <Pressable
          onPress={handleAddCard}
          disabled={isAddingCard}
          className="bg-brand rounded-2xl py-4 items-center active:opacity-90"
        >
          {isAddingCard ? (
            <ActivityIndicator color="#1a1a2e" size="small" />
          ) : (
            <Text className="text-dark font-bold text-base">
              + Add Payment Method
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
