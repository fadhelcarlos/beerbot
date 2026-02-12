/**
 * Image utilities for BeerBot demo.
 *
 * Maps beer styles and venue names to beautiful, high-quality Unsplash images.
 * These provide a realistic demo experience without requiring database image URLs.
 */

// ────────────────────────────────────────────────────
// Beer Style → Image URL mapping
// Uses Unsplash permanent photo URLs (direct links)
// ────────────────────────────────────────────────────

const BEER_STYLE_IMAGES: Record<string, string> = {
  // IPAs
  ipa: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop&q=80',
  'double ipa':
    'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop&q=80',
  'west coast ipa':
    'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop&q=80',
  'new england ipa':
    'https://images.unsplash.com/photo-1566702612791-0e32e9b38cf8?w=600&h=600&fit=crop&q=80',
  'hazy ipa':
    'https://images.unsplash.com/photo-1566702612791-0e32e9b38cf8?w=600&h=600&fit=crop&q=80',

  // Stouts & Porters
  stout:
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop&q=80',
  'imperial stout':
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop&q=80',
  porter:
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=600&fit=crop&q=80',

  // Wheat & Light
  'wheat ale':
    'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&h=600&fit=crop&q=80',
  wheat:
    'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&h=600&fit=crop&q=80',
  hefeweizen:
    'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&h=600&fit=crop&q=80',
  witbier:
    'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&h=600&fit=crop&q=80',

  // Lagers & Pilsners
  lager:
    'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=600&h=600&fit=crop&q=80',
  pilsner:
    'https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=600&h=600&fit=crop&q=80',

  // Pale Ales
  'pale ale':
    'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=600&h=600&fit=crop&q=80',
  'amber ale':
    'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=600&h=600&fit=crop&q=80',

  // Sours
  sour: 'https://images.unsplash.com/photo-1587668178277-295251f900ce?w=600&h=600&fit=crop&q=80',
  'sour ale':
    'https://images.unsplash.com/photo-1587668178277-295251f900ce?w=600&h=600&fit=crop&q=80',
  gose: 'https://images.unsplash.com/photo-1587668178277-295251f900ce?w=600&h=600&fit=crop&q=80',

  // Belgian
  belgian:
    'https://images.unsplash.com/photo-1612528443702-f264647ceb92?w=600&h=600&fit=crop&q=80',
  tripel:
    'https://images.unsplash.com/photo-1612528443702-f264647ceb92?w=600&h=600&fit=crop&q=80',
  dubbel:
    'https://images.unsplash.com/photo-1612528443702-f264647ceb92?w=600&h=600&fit=crop&q=80',
  saison:
    'https://images.unsplash.com/photo-1612528443702-f264647ceb92?w=600&h=600&fit=crop&q=80',
};

// Default beer image for unknown styles
const DEFAULT_BEER_IMAGE =
  'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=600&h=600&fit=crop&q=80';

/**
 * Get a beautiful image URL for a given beer style.
 * Falls back to a generic craft beer image if the style is unrecognized.
 */
export function getBeerImageUrl(
  style: string | null | undefined,
  imageUrl: string | null | undefined,
): string {
  // Prefer the database image_url if present
  if (imageUrl) return imageUrl;

  if (!style) return DEFAULT_BEER_IMAGE;

  const normalized = style.toLowerCase().trim();

  // Exact match
  if (BEER_STYLE_IMAGES[normalized]) return BEER_STYLE_IMAGES[normalized];

  // Partial match — check if style contains a key
  for (const [key, url] of Object.entries(BEER_STYLE_IMAGES)) {
    if (normalized.includes(key) || key.includes(normalized)) return url;
  }

  return DEFAULT_BEER_IMAGE;
}

// ────────────────────────────────────────────────────
// Venue → Image URL mapping
// Beautiful bar/brewery interior shots
// ────────────────────────────────────────────────────

const VENUE_IMAGES: string[] = [
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=800&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1538488881038-e252a119ace7?w=800&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1574634534894-89d7576c8259?w=800&h=400&fit=crop&q=80',
];

/**
 * Get a beautiful venue image URL.
 * Uses a deterministic hash of the venue ID/name to pick a consistent image.
 */
export function getVenueImageUrl(
  venueId: string | undefined,
  venueName: string | undefined,
  imageUrl?: string | null,
): string {
  // Prefer the database image_url if present
  if (imageUrl) return imageUrl;

  const seed = venueId ?? venueName ?? 'default';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % VENUE_IMAGES.length;
  return VENUE_IMAGES[index];
}
