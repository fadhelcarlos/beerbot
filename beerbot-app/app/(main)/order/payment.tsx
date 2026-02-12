import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { fetchVenueTaps, subscribeTaps } from '@/lib/api/venues';
import { createOrder, getOrder } from '@/lib/api/orders';
import {
  initializePaymentSheet,
  presentPayment,
} from '@/lib/api/payments';
import { supabase } from '@/lib/supabase';
import { formatErrorMessage } from '@/lib/utils/error-handler';
import type { Order, Tap, TapWithBeer } from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PaymentState =
  | 'loading'
  | 'ready'
  | 'processing'
  | 'success'
  | 'failed'
  | 'checking_status'
  | 'error';

// ─────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────

export default function PaymentScreen() {
  const { tapId, venueId, quantity, totalPrice } = useLocalSearchParams<{
    tapId: string;
    venueId: string;
    quantity: string;
    totalPrice: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paymentState, setPaymentState] = useState<PaymentState>('loading');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const hasNavigated = useRef(false);
  const isPayingRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inventoryChannelRef = useRef<RealtimeChannel | null>(null);
  const queryClient = useQueryClient();

  const qty = Number(quantity ?? '1');
  const displayTotal = totalPrice ?? '0.00';

  // Monitor inventory changes — alert if beer becomes unavailable before payment
  useEffect(() => {
    if (!venueId || !tapId) return;

    inventoryChannelRef.current = subscribeTaps(venueId, (updatedTap: Tap) => {
      if (updatedTap.id !== tapId) return;

      // Update the shared query cache
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

      // Check if beer is no longer available for mobile ordering
      const ozRemaining = updatedTap.oz_remaining;
      const lowThreshold = updatedTap.low_threshold_oz;
      const isUnavailable = ozRemaining <= 0 || ozRemaining <= lowThreshold;

      if (isUnavailable && !hasNavigated.current) {
        hasNavigated.current = true;
        cleanupPolling();
        Alert.alert(
          'Beer Unavailable',
          'This beer is no longer available for mobile ordering.',
          [{
            text: 'OK',
            onPress: () => router.replace(`/(main)/venues/${venueId}` as `/(main)/venues/${string}`),
          }],
        );
      }
    });

    return () => {
      inventoryChannelRef.current?.unsubscribe();
      inventoryChannelRef.current = null;
    };
  }, [venueId, tapId, queryClient, router]);

  // Fetch tap data for order summary display
  const tapsQuery = useQuery({
    queryKey: ['venue-taps', venueId],
    queryFn: () => fetchVenueTaps(venueId!),
    enabled: !!venueId,
    staleTime: 1000 * 60,
  });

  const tap = useMemo(
    () => tapsQuery.data?.find((t: TapWithBeer) => t.id === tapId) ?? null,
    [tapsQuery.data, tapId],
  );

  const beer = tap?.beer ?? null;
  const unitPrice = tap?.price_12oz ?? 0;

  // ─────────────────────────────────────────────────
  // Create order + initialize payment on mount
  // ─────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // Step 1: Create the order atomically
        const orderResponse = await createOrder({
          tap_id: tapId!,
          quantity: qty,
        });

        if (cancelled) return;

        setOrderId(orderResponse.order_id);
        setServerAmount(orderResponse.total_amount);

        // Step 2: Initialize Stripe Payment Sheet with the order
        await initializePaymentSheet(orderResponse.order_id);

        if (cancelled) return;

        setPaymentState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(formatErrorMessage(err));
        setPaymentState('error');
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, [tapId, qty]);

  // ─────────────────────────────────────────────────
  // Realtime subscription for order status changes
  // ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updatedOrder = payload.new as Order;

          if (
            updatedOrder.status === 'paid' ||
            updatedOrder.status === 'ready_to_redeem'
          ) {
            // Payment confirmed via webhook — navigate to QR
            if (!hasNavigated.current) {
              hasNavigated.current = true;
              cleanupPolling();
              setPaymentState('success');

              // Brief celebration moment then navigate
              setTimeout(() => {
                router.replace({
                  pathname: '/(main)/order/redeem',
                  params: { orderId: updatedOrder.id },
                });
              }, 1500);
            }
          } else if (updatedOrder.status === 'cancelled') {
            setErrorMessage('Payment declined');
            setPaymentState('failed');
            cleanupPolling();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
      realtimeChannelRef.current = null;
    };
  }, [orderId, router]);

  // ─────────────────────────────────────────────────
  // Polling fallback for network issues
  // ─────────────────────────────────────────────────

  const startStatusPolling = useCallback(() => {
    if (!orderId || statusPollRef.current) return;

    setPaymentState('checking_status');

    statusPollRef.current = setInterval(async () => {
      try {
        const order = await getOrder(orderId);
        if (
          order.status === 'paid' ||
          order.status === 'ready_to_redeem'
        ) {
          if (!hasNavigated.current) {
            hasNavigated.current = true;
            cleanupPolling();
            setPaymentState('success');
            setTimeout(() => {
              router.replace({
                pathname: '/(main)/order/redeem',
                params: { orderId: order.id },
              });
            }, 1500);
          }
        } else if (
          order.status === 'cancelled' ||
          order.status === 'expired'
        ) {
          cleanupPolling();
          setErrorMessage('Payment was not completed');
          setPaymentState('failed');
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    // Stop polling after 30s
    setTimeout(() => {
      if (statusPollRef.current) {
        cleanupPolling();
        if (paymentState === 'checking_status') {
          setErrorMessage(
            'Could not confirm payment status. Please check your order history.',
          );
          setPaymentState('failed');
        }
      }
    }, 30000);
  }, [orderId, router, paymentState]);

  function cleanupPolling() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => cleanupPolling();
  }, []);

  // ─────────────────────────────────────────────────
  // Network drop detection: if network drops mid-payment, show checking status
  // and auto-start polling when reconnected
  // ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasProcessing =
        paymentState === 'processing' || paymentState === 'checking_status';
      if (
        state.isConnected === false &&
        wasProcessing &&
        !statusPollRef.current
      ) {
        setPaymentState('checking_status');
      }

      if (
        state.isConnected &&
        paymentState === 'checking_status' &&
        !statusPollRef.current &&
        !hasNavigated.current
      ) {
        startStatusPolling();
      }
    });

    return () => unsubscribe();
  }, [orderId, paymentState, startStatusPolling]);

  // ─────────────────────────────────────────────────
  // Handle Pay Button
  // ─────────────────────────────────────────────────

  const handlePay = useCallback(async () => {
    // Idempotency: prevent double-tap
    if (isPayingRef.current) return;
    isPayingRef.current = true;

    setPaymentState('processing');

    try {
      const success = await presentPayment();

      if (!success) {
        // User cancelled the payment sheet
        isPayingRef.current = false;
        setPaymentState('ready');
        return;
      }

      // Payment sheet completed — wait for webhook confirmation via realtime
      // The realtime subscription will handle navigation to QR screen
      // Set a fallback timeout in case realtime is slow
      setTimeout(() => {
        if (!hasNavigated.current && paymentState !== 'success') {
          startStatusPolling();
        }
      }, 5000);
    } catch (err) {
      isPayingRef.current = false;
      setErrorMessage(formatErrorMessage(err));
      setPaymentState('failed');
    }
  }, [paymentState, startStatusPolling]);

  // ─────────────────────────────────────────────────
  // Retry after failure
  // ─────────────────────────────────────────────────

  const handleRetry = useCallback(async () => {
    if (!orderId) return;
    isPayingRef.current = false;
    hasNavigated.current = false;
    setErrorMessage('');

    try {
      setPaymentState('loading');
      // Re-initialize payment sheet (uses idempotent PaymentIntent)
      await initializePaymentSheet(orderId);
      setPaymentState('ready');
    } catch (err) {
      setErrorMessage(formatErrorMessage(err));
      setPaymentState('error');
    }
  }, [orderId]);

  // ─────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────

  if (paymentState === 'loading') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white/40 text-sm mt-4">
          Setting up payment...
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Processing State
  // ─────────────────────────────────────────────────

  if (paymentState === 'processing') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white text-lg font-semibold mt-6 text-center">
          Processing payment...
        </Text>
        <Text className="text-white/40 text-sm mt-2 text-center">
          Please do not close the app
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Checking Status State (network fallback)
  // ─────────────────────────────────────────────────

  if (paymentState === 'checking_status') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="text-white text-lg font-semibold mt-6 text-center">
          Checking payment status...
        </Text>
        <Text className="text-white/40 text-sm mt-2 text-center">
          This may take a moment
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Success State
  // ─────────────────────────────────────────────────

  if (paymentState === 'success') {
    return (
      <View
        className="flex-1 bg-dark items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        <Animated.View entering={FadeIn.duration(400)} className="items-center">
          <Text className="text-6xl">{'\uD83C\uDF89'}</Text>
          <Text className="text-white text-xl font-bold mt-6 text-center">
            Payment Successful!
          </Text>
          <Text className="text-white/40 text-sm mt-2 text-center">
            Getting your QR code ready...
          </Text>
        </Animated.View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Setup Error State (order creation failed)
  // ─────────────────────────────────────────────────

  if (paymentState === 'error') {
    return (
      <View
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u26A0\uFE0F'}</Text>
            <Text className="text-white text-xl font-bold mt-6 text-center">
              Something went wrong
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              {errorMessage}
            </Text>
          </Animated.View>
        </View>
        <View className="px-6">
          <Pressable
            onPress={() => router.back()}
            className="w-full items-center justify-center rounded-2xl py-4 bg-dark-600 active:opacity-80"
          >
            <Text className="text-lg font-bold text-white">Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Payment Failed State
  // ─────────────────────────────────────────────────

  if (paymentState === 'failed') {
    return (
      <View
        className="flex-1 bg-dark"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        <View className="flex-1 items-center justify-center px-8">
          <Animated.View entering={FadeIn.duration(400)} className="items-center">
            <Text className="text-5xl">{'\u274C'}</Text>
            <Text className="text-white text-xl font-bold mt-6 text-center">
              Payment Failed
            </Text>
            <Text className="text-white/50 text-base mt-3 text-center leading-6">
              {errorMessage || 'Payment declined'}
            </Text>
          </Animated.View>
        </View>
        <View className="px-6 gap-3">
          <Pressable
            onPress={handleRetry}
            className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
          >
            <Text className="text-lg font-bold text-dark">Try Again</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            className="w-full items-center justify-center rounded-2xl py-4 bg-dark-600 active:opacity-80"
          >
            <Text className="text-lg font-bold text-white">Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // Render: Ready State (main payment screen)
  // ─────────────────────────────────────────────────

  const amount = serverAmount ?? Number(displayTotal);

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => {
            Alert.alert(
              'Cancel Payment?',
              'Your order will be cancelled.',
              [
                { text: 'Stay', style: 'cancel' },
                {
                  text: 'Cancel Order',
                  style: 'destructive',
                  onPress: () => router.back(),
                },
              ],
            );
          }}
          className="px-6 pt-4 pb-2 self-start active:opacity-60"
          hitSlop={16}
        >
          <Text className="text-brand text-base">{'\u2190'} Back</Text>
        </Pressable>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(50).duration(350)}
          className="mx-6 mt-4"
        >
          <Text className="text-2xl font-bold text-white">
            Confirm & Pay
          </Text>
        </Animated.View>

        {/* Order Summary Card */}
        <Animated.View
          entering={FadeInDown.delay(150).duration(350)}
          className="mx-6 mt-6 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-sm font-semibold text-white/50 mb-4 uppercase tracking-wider">
            Order Summary
          </Text>

          {/* Beer info */}
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 rounded-xl bg-brand/15 items-center justify-center mr-3">
              <Text className="text-2xl">{'\uD83C\uDF7A'}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">
                {beer?.name ?? 'Beer'}
              </Text>
              <Text className="text-sm text-white/40 mt-0.5">
                {beer?.style ?? ''} {beer?.abv ? `${'\u00B7'} ${beer.abv}% ABV` : ''}
              </Text>
            </View>
          </View>

          {/* Assigned tap */}
          {tap && (
            <View className="flex-row items-center mb-4">
              <View className="bg-brand/15 rounded-full px-3 py-1">
                <Text className="text-xs font-semibold text-brand">
                  Tap #{tap.tap_number}
                </Text>
              </View>
            </View>
          )}

          {/* Price breakdown */}
          <View className="border-t border-dark-600 pt-4 mt-1">
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-white/50">Unit price</Text>
              <Text className="text-sm text-white/70">
                ${unitPrice.toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-sm text-white/50">Quantity</Text>
              <Text className="text-sm text-white/70">
                {'\u00D7'} {qty}
              </Text>
            </View>
            <View className="h-px bg-dark-600 my-3" />
            <View className="flex-row justify-between items-center">
              <Text className="text-base font-bold text-white">Total</Text>
              <Text className="text-xl font-bold text-brand">
                ${amount.toFixed(2)}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Payment Methods Info */}
        <Animated.View
          entering={FadeInDown.delay(250).duration(350)}
          className="mx-6 mt-6 bg-dark-700 rounded-2xl p-5 border border-dark-600"
        >
          <Text className="text-sm font-semibold text-white/50 mb-3 uppercase tracking-wider">
            Payment Method
          </Text>
          <Text className="text-sm text-white/60 leading-5">
            Apple Pay, Google Pay, and card payments are available. Tap the
            button below to choose your preferred method.
          </Text>
        </Animated.View>

        {/* Security notice */}
        <Animated.View
          entering={FadeInDown.delay(350).duration(350)}
          className="mx-6 mt-4 px-2"
        >
          <Text className="text-xs text-white/30 text-center leading-5">
            {'\uD83D\uDD12'} Payments are processed securely by Stripe
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Fixed CTA button at bottom */}
      <Animated.View
        entering={FadeIn.delay(400).duration(400)}
        className="absolute bottom-0 left-0 right-0 px-6 bg-dark border-t border-dark-600"
        style={{ paddingBottom: insets.bottom + 12, paddingTop: 12 }}
      >
        <Pressable
          onPress={handlePay}
          className="w-full items-center justify-center rounded-2xl py-4 bg-brand active:opacity-80"
        >
          <Text className="text-lg font-bold text-dark">
            Pay ${amount.toFixed(2)}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
