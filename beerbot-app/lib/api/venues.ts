import { supabase } from '@/lib/supabase';
import type {
  Beer,
  Tap,
  TapPricing,
  TapWithBeer,
  Venue,
  VenueWithDistance,
} from '@/types/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================
// Venues
// ============================================================

/**
 * Fetch all active venues, optionally sorted by proximity to the given coordinates.
 * When lat/lng are provided, calls the `get_venues_nearby` RPC function which
 * returns results sorted by distance (Haversine) and includes `distance_miles`.
 * Without coordinates, fetches directly from the venues table sorted by name.
 */
export async function fetchVenues(params?: {
  latitude?: number;
  longitude?: number;
}): Promise<VenueWithDistance[]> {
  if (params?.latitude != null && params?.longitude != null) {
    const { data, error } = await supabase.rpc('get_venues_nearby', {
      user_lat: params.latitude,
      user_lng: params.longitude,
    });

    if (error) throw error;
    return (data ?? []) as VenueWithDistance[];
  }

  // No coordinates — simple fetch sorted by name
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  return (data ?? []).map((v: Venue) => ({
    ...v,
    distance_miles: null,
  }));
}

/**
 * Fetch active tap counts for a list of venue IDs.
 * Returns a map of venueId -> active tap count.
 */
export async function fetchVenueActiveTapCounts(
  venueIds: string[],
): Promise<Record<string, number>> {
  if (venueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('taps')
    .select('venue_id')
    .in('venue_id', venueIds)
    .eq('status', 'active');

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.venue_id] = (counts[row.venue_id] ?? 0) + 1;
  }
  return counts;
}

// ============================================================
// Taps
// ============================================================

type TapRow = Tap & {
  beers: Beer | null;
  tap_pricing: Pick<TapPricing, 'price_12oz'>[];
};

function computeAvailability(
  ozRemaining: number,
  lowThresholdOz: number,
): TapWithBeer['availability_status'] {
  if (ozRemaining <= 0) return 'out';
  if (ozRemaining <= lowThresholdOz) return 'low';
  return 'available';
}

function mapTapRow(row: TapRow): TapWithBeer {
  const pricing = row.tap_pricing?.[0];
  return {
    id: row.id,
    venue_id: row.venue_id,
    tap_number: row.tap_number,
    beer_id: row.beer_id,
    status: row.status,
    oz_remaining: row.oz_remaining,
    low_threshold_oz: row.low_threshold_oz,
    temperature_f: row.temperature_f,
    temp_ok: row.temp_ok,
    temp_threshold_f: row.temp_threshold_f,
    created_at: row.created_at,
    updated_at: row.updated_at,
    beer: row.beers ?? null,
    price_12oz: pricing?.price_12oz ?? null,
    availability_status: computeAvailability(row.oz_remaining, row.low_threshold_oz),
  };
}

/**
 * Fetch active taps for a venue with joined beer name, style, pricing, and
 * computed availability_status + temp_ok.
 */
export async function fetchVenueTaps(venueId: string): Promise<TapWithBeer[]> {
  const { data, error } = await supabase
    .from('taps')
    .select(
      `
      *,
      beers (*),
      tap_pricing (price_12oz)
    `,
    )
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .order('tap_number');

  if (error) throw error;
  return (data ?? []).map((row: TapRow) => mapTapRow(row));
}

// ============================================================
// Realtime
// ============================================================

/**
 * Subscribe to realtime changes on the taps table for a specific venue.
 * Calls `onUpdate` with the changed tap row whenever an UPDATE occurs.
 * Returns the RealtimeChannel (call `.unsubscribe()` to clean up).
 */
export function subscribeTaps(
  venueId: string,
  onUpdate: (tap: Tap) => void,
): RealtimeChannel {
  return supabase
    .channel(`taps:venue_id=eq.${venueId}`)
    .on<Tap>(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'taps',
        filter: `venue_id=eq.${venueId}`,
      },
      (payload) => {
        onUpdate(payload.new);
      },
    )
    .subscribe();
}
