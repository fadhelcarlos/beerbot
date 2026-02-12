export interface Venue {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  mobile_ordering_enabled: boolean;
  created_at: string;
}

export interface VenueWithDistance extends Venue {
  distance_miles: number | null;
}

export interface TapPricing {
  id: string;
  tap_id: string;
  price_12oz: number;
  pour_size_oz: number;
  currency: string;
  created_at: string;
}

export interface Beer {
  id: string;
  name: string;
  style: string;
  abv: number;
  description: string;
  image_url: string | null;
  created_at: string;
}

export interface Tap {
  id: string;
  venue_id: string;
  tap_number: number;
  beer_id: string | null;
  status: 'active' | 'inactive' | 'maintenance';
  oz_remaining: number;
  low_threshold_oz: number;
  temperature_f: number | null;
  temp_ok: boolean;
  temp_threshold_f: number;
  created_at: string;
  updated_at: string;
}

export interface TapWithBeer extends Tap {
  beer: Beer | null;
  price_12oz: number | null;
  availability_status: 'available' | 'low' | 'out';
}

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'ready_to_redeem'
  | 'redeemed'
  | 'pouring'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

// ============================================================
// Verification
// ============================================================

export type VerificationAttemptStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'resubmit'
  | 'expired'
  | 'unknown';

export interface VerificationAttempt {
  id: string;
  user_id: string;
  session_id: string;
  status: VerificationAttemptStatus;
  created_at: string;
}

export interface VerificationSession {
  session_url: string;
  session_id: string;
  session_token: string;
}

export interface VerificationStatus {
  age_verified: boolean;
  age_verification_ref: string | null;
  age_verified_at: string | null;
}

// ============================================================
// Orders
// ============================================================

export interface CreateOrderRequest {
  tap_id: string;
  quantity?: number;
}

export interface CreateOrderResponse {
  order_id: string;
  venue_id: string;
  tap_id: string;
  beer_id: string;
  quantity: number;
  pour_size_oz: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  expires_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  venue_id: string;
  tap_id: string;
  beer_id: string;
  quantity: number;
  pour_size_oz: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  qr_code_token: string | null;
  qr_expires_at: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  redeemed_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithDetails extends Order {
  beer_name: string;
  beer_style: string;
  venue_name: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================
// QR Tokens
// ============================================================

export interface GenerateQrTokenRequest {
  order_id: string;
}

export interface GenerateQrTokenResponse {
  qr_token: string;
}

export interface VerifyQrTokenRequest {
  qr_token: string;
}

export interface VerifyQrTokenResponse {
  valid: boolean;
  order_id?: string;
  tap_id?: string;
  venue_id?: string;
  user_id?: string;
  error?: string;
  code?: string;
}

// ============================================================
// Payments
// ============================================================

export interface CreatePaymentIntentRequest {
  order_id: string;
}

export interface CreatePaymentIntentResponse {
  client_secret: string;
  ephemeral_key: string;
  customer_id: string;
  payment_intent_id: string;
}

// ============================================================
// PLC Stub Endpoints (Pour Start / Pour Complete)
// ============================================================

export interface PourStartRequest {
  order_id: string;
  tap_id: string;
  quantity: number;
  pour_size_oz: number;
  token: string;
}

export interface PourCommand {
  order_id: string;
  tap_id: string;
  tap_number: number;
  quantity: number;
  pour_size_oz: number;
  total_oz: number;
  user_id: string;
  venue_id: string;
}

export interface PourStartResponse {
  success: boolean;
  pour_command?: PourCommand;
  error?: string;
  code?: string;
  correct_tap_id?: string;
  correct_tap_number?: number;
  oz_remaining?: number;
  oz_required?: number;
}

export interface PourCompleteRequest {
  order_id: string;
  tap_id: string;
  actual_oz_poured: number;
}

export interface PourCompleteResponse {
  success: boolean;
  order_id?: string;
  status?: string;
  actual_oz_poured?: number;
  expected_oz?: number;
  variance_oz?: number;
  error?: string;
  code?: string;
}
