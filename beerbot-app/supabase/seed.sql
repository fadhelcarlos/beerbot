-- BeerBot seed data for development
-- 1 venue, 3 beers, 3 taps with pricing

-- ============================================================
-- Venue
-- ============================================================

INSERT INTO venues (id, name, address, latitude, longitude)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The Hoppy Spot',
  '123 Brewery Lane, Portland, OR 97201',
  45.5231,
  -122.6765
);

-- ============================================================
-- Beers
-- ============================================================

INSERT INTO beers (id, name, style, abv, description) VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    'Golden Cascade IPA',
    'IPA',
    6.8,
    'A bold West Coast IPA with Cascade and Centennial hops. Citrus and pine aroma with a clean bitter finish.'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'Midnight Stout',
    'Stout',
    5.4,
    'Rich and creamy Irish-style dry stout. Notes of roasted barley, dark chocolate, and espresso.'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'Sunshine Wheat',
    'Wheat Ale',
    4.5,
    'Light and refreshing American wheat ale with hints of orange peel and coriander. Perfect for a sunny day.'
  );

-- ============================================================
-- Taps (3 taps at the venue, each pouring a different beer)
-- ============================================================

INSERT INTO taps (id, venue_id, tap_number, beer_id, status, oz_remaining, temperature_f) VALUES
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    1,
    '00000000-0000-0000-0000-000000000101',
    'active',
    960,
    36.5
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000001',
    2,
    '00000000-0000-0000-0000-000000000102',
    'active',
    640,
    37.0
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000001',
    3,
    '00000000-0000-0000-0000-000000000103',
    'active',
    1280,
    35.8
  );

-- ============================================================
-- Tap Pricing
-- ============================================================

INSERT INTO tap_pricing (tap_id, price_12oz) VALUES
  ('00000000-0000-0000-0000-000000000201', 7.50),
  ('00000000-0000-0000-0000-000000000202', 6.50),
  ('00000000-0000-0000-0000-000000000203', 5.50);
