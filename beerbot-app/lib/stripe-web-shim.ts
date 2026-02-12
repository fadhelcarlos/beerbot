/**
 * Web shim for @stripe/stripe-react-native.
 * On web we run in STRIPE_MOCK mode so the real SDK is never called.
 * This file satisfies import resolution for the Metro web bundler.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

export function StripeProvider({ children }: { children: React.ReactElement }) {
  return children;
}

export function initPaymentSheet(_params: Record<string, unknown>) {
  return Promise.resolve({ error: undefined });
}

export function presentPaymentSheet() {
  return Promise.resolve({ error: undefined });
}

export function useStripe() {
  return {
    initPaymentSheet,
    presentPaymentSheet,
    confirmPaymentSheetPayment: () => Promise.resolve({ error: undefined }),
    createToken: () => Promise.resolve({ error: undefined, token: undefined }),
    retrievePaymentIntent: () => Promise.resolve({ error: undefined, paymentIntent: undefined }),
  };
}
