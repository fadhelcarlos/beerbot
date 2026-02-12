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
