import { initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import type {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
} from '@/types/api';

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

const STRIPE_MOCK = process.env.EXPO_PUBLIC_STRIPE_MOCK === 'true';

const MERCHANT_DISPLAY_NAME = 'BeerBot';

// Stores the current order ID for mock mode's presentPayment call
let _mockOrderId: string | null = null;

/**
 * Create a PaymentIntent for a given order by invoking the
 * create-payment-intent Edge Function. Returns the client_secret
 * and ephemeral_key needed to present the Stripe payment sheet.
 */
export async function createPaymentIntent(
  request: CreatePaymentIntentRequest,
): Promise<CreatePaymentIntentResponse> {
  const { data, error } =
    await supabase.functions.invoke<CreatePaymentIntentResponse>(
      'create-payment-intent',
      {
        method: 'POST',
        body: request,
      },
    );

  if (error) throw error;
  if (!data) throw new Error('No data returned from create-payment-intent');

  return data;
}

/**
 * Initialize the Stripe SDK payment sheet for a given order.
 * Calls createPaymentIntent, then configures the native payment sheet
 * with Apple Pay, Google Pay, and card support.
 *
 * In mock mode: skips Stripe entirely and stores orderId for later confirmation.
 *
 * Returns the PaymentIntent response for reference (e.g. payment_intent_id).
 */
export async function initializePaymentSheet(
  orderId: string,
): Promise<CreatePaymentIntentResponse> {
  // --- MOCK MODE: skip Stripe SDK ---
  if (STRIPE_MOCK) {
    _mockOrderId = orderId;
    return {
      client_secret: 'mock_cs_' + orderId,
      ephemeral_key: 'mock_ek_' + orderId,
      customer_id: 'mock_cus_dev',
      payment_intent_id: 'mock_pi_' + orderId,
    } as CreatePaymentIntentResponse;
  }

  const paymentData = await createPaymentIntent({ order_id: orderId });

  const { error } = await initPaymentSheet({
    paymentIntentClientSecret: paymentData.client_secret,
    customerEphemeralKeySecret: paymentData.ephemeral_key,
    customerId: paymentData.customer_id,
    merchantDisplayName: MERCHANT_DISPLAY_NAME,
    applePay: {
      merchantCountryCode: 'US',
    },
    googlePay: {
      merchantCountryCode: 'US',
      testEnv: __DEV__,
    },
    returnURL: 'beerbot://payment-complete',
  });

  if (error) throw error;

  return paymentData;
}

/**
 * Present the Stripe payment sheet to the user.
 * Must call initializePaymentSheet first.
 *
 * In mock mode: calls dev_confirm_payment RPC to simulate payment success.
 * The realtime subscription in payment.tsx will detect the status change.
 *
 * Returns true if payment was successful, false if user cancelled.
 * Throws on error.
 */
export async function presentPayment(): Promise<boolean> {
  // --- MOCK MODE: confirm payment via RPC ---
  if (STRIPE_MOCK) {
    if (!_mockOrderId) throw new Error('No order to confirm (mock mode)');

    const { data, error } = await supabase.rpc('dev_confirm_payment', {
      p_order_id: _mockOrderId,
    });

    if (error) throw error;

    const result = data as { error?: string; code?: string };
    if (result?.error) {
      throw new Error(result.error);
    }

    return true;
  }

  const { error } = await presentPaymentSheet();

  if (error) {
    if (error.code === 'Canceled') {
      return false;
    }
    throw error;
  }

  return true;
}

/**
 * Get the Stripe publishable key for StripeProvider initialization.
 */
export function getStripePublishableKey(): string {
  return STRIPE_PUBLISHABLE_KEY;
}

/**
 * Whether Stripe mock mode is active (for UI hints).
 */
export function isStripeMockMode(): boolean {
  return STRIPE_MOCK;
}
