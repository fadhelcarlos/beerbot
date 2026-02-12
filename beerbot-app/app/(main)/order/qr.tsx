import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Legacy QR route — redirects to the full redeem screen.
 * The actual QR display and order status tracking lives in redeem.tsx.
 */
export default function QrScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  useEffect(() => {
    if (orderId) {
      router.replace(`/(main)/order/redeem?orderId=${orderId}`);
    } else {
      router.replace('/(main)/venues');
    }
  }, [orderId, router]);

  return null;
}
