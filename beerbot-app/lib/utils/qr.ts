import { supabase } from '@/lib/supabase';
import type {
  GenerateQrTokenResponse,
  VerifyQrTokenResponse,
} from '@/types/api';

/**
 * Generate a QR code data string from a JWT token.
 * The returned string is suitable for rendering via react-native-qrcode-svg.
 *
 * Format: "beerbot://redeem?token=<jwt>"
 * This deep link format allows the venue's scanning device to open the
 * verification flow directly.
 */
export function generateQrDataString(token: string): string {
  return `beerbot://redeem?token=${encodeURIComponent(token)}`;
}

/**
 * Request a QR token for a given order by calling the generate-qr-token
 * Edge Function. The function signs a JWT with the order's details and
 * stores it in the orders table.
 *
 * Returns the JWT token string for QR code rendering.
 */
export async function generateQrToken(
  orderId: string,
): Promise<GenerateQrTokenResponse> {
  const { data, error } = await supabase.functions.invoke<GenerateQrTokenResponse>(
    'generate-qr-token',
    {
      method: 'POST',
      body: { order_id: orderId },
    },
  );

  if (error) throw error;
  if (!data) throw new Error('No data returned from generate-qr-token');

  return data;
}

/**
 * Verify a QR token by calling the verify-qr-token Edge Function.
 * This validates the JWT signature, checks expiration, confirms the
 * order exists and is redeemable, then marks it as redeemed.
 *
 * Returns validation result with order details on success.
 */
export async function verifyQrToken(
  token: string,
): Promise<VerifyQrTokenResponse> {
  const { data, error } = await supabase.functions.invoke<VerifyQrTokenResponse>(
    'verify-qr-token',
    {
      method: 'POST',
      body: { qr_token: token },
    },
  );

  if (error) throw error;
  if (!data) throw new Error('No data returned from verify-qr-token');

  return data;
}
