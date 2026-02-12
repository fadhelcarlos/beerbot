import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { getOrder } from '@/lib/api/orders';
import type { OrderStatus } from '@/types/api';

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
        label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        bgClass: 'bg-yellow-500/20',
        textClass: 'text-yellow-400',
      };
    case 'expired':
    case 'cancelled':
      return { label: status === 'expired' ? 'Expired' : 'Cancelled', bgClass: 'bg-red-500/20', textClass: 'text-red-400' };
    case 'refunded':
      return { label: 'Refunded', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' };
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center py-2">
      <Text className="text-sm text-white/50">{label}</Text>
      <Text className="text-sm text-white/80">{value}</Text>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id!),
    enabled: !!id,
  });

  const order = orderQuery.data;

  if (orderQuery.isLoading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#f59e0b" size="large" />
      </View>
    );
  }

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

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} className="px-6 pt-4 pb-2 self-start active:opacity-60" hitSlop={16}>
          <Text className="text-brand text-base">{'\u2190'} Back</Text>
        </Pressable>

        <Animated.View entering={FadeIn.duration(400)} className="px-6 mt-4">
          <Text className="text-2xl font-bold text-white">Order Details</Text>

          {/* Status badge */}
          <View className="mt-4">
            <View className={`self-start ${statusConfig.bgClass} rounded-full px-3 py-1`}>
              <Text className={`text-sm font-semibold ${statusConfig.textClass}`}>{statusConfig.label}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Order info card */}
        <Animated.View entering={FadeInDown.delay(100).duration(350)} className="mx-6 mt-6 bg-dark-700 rounded-2xl p-5 border border-dark-600">
          <InfoRow label="Order ID" value={order.id.slice(0, 8) + '...'} />
          <View className="h-px bg-dark-600 my-1" />
          <InfoRow label="Quantity" value={`${order.quantity} \u00D7 ${order.pour_size_oz}oz`} />
          <View className="h-px bg-dark-600 my-1" />
          <InfoRow label="Unit Price" value={`$${order.unit_price.toFixed(2)}`} />
          <View className="h-px bg-dark-600 my-1" />
          <InfoRow label="Total" value={`$${order.total_amount.toFixed(2)}`} />
          <View className="h-px bg-dark-600 my-1" />
          <InfoRow label="Date" value={new Date(order.created_at).toLocaleString()} />
          {order.paid_at && (
            <>
              <View className="h-px bg-dark-600 my-1" />
              <InfoRow label="Paid at" value={new Date(order.paid_at).toLocaleString()} />
            </>
          )}
          {order.completed_at && (
            <>
              <View className="h-px bg-dark-600 my-1" />
              <InfoRow label="Completed at" value={new Date(order.completed_at).toLocaleString()} />
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
