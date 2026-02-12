import { supabase } from '@/lib/supabase';
import type {
  ListPaymentMethodsResponse,
  CreateSetupIntentResponse,
} from '@/types/api';

/**
 * Fetch all saved payment methods for the authenticated user.
 */
export async function listPaymentMethods(): Promise<ListPaymentMethodsResponse> {
  const { data, error } =
    await supabase.functions.invoke<ListPaymentMethodsResponse>(
      'payment-methods',
      {
        method: 'POST',
        body: { action: 'list' },
      },
    );

  if (error) throw error;
  if (!data) throw new Error('No data returned from payment-methods');

  return data;
}

/**
 * Detach (delete) a saved payment method from the user's Stripe customer.
 */
export async function detachPaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('payment-methods', {
    method: 'POST',
    body: { action: 'detach', payment_method_id: paymentMethodId },
  });

  if (error) throw error;
}

/**
 * Set a payment method as the default for the user's Stripe customer.
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('payment-methods', {
    method: 'POST',
    body: { action: 'set_default', payment_method_id: paymentMethodId },
  });

  if (error) throw error;
}

/**
 * Create a SetupIntent for adding a new card without charging.
 * Returns the client secret and ephemeral key for the Stripe SDK.
 */
export async function createSetupIntent(): Promise<CreateSetupIntentResponse> {
  const { data, error } =
    await supabase.functions.invoke<CreateSetupIntentResponse>(
      'payment-methods',
      {
        method: 'POST',
        body: { action: 'create_setup_intent' },
      },
    );

  if (error) throw error;
  if (!data) throw new Error('No data returned from create_setup_intent');

  return data;
}
