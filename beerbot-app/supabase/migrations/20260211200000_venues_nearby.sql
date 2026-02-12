-- US-004: SQL function for fetching venues with optional proximity sorting
-- Uses Haversine formula for distance calculation (no PostGIS dependency)

CREATE OR REPLACE FUNCTION get_venues_nearby(
  user_lat decimal DEFAULT NULL,
  user_lng decimal DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  latitude decimal,
  longitude decimal,
  is_active boolean,
  mobile_ordering_enabled boolean,
  created_at timestamptz,
  distance_miles double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id,
    v.name,
    v.address,
    v.latitude,
    v.longitude,
    v.is_active,
    v.mobile_ordering_enabled,
    v.created_at,
    CASE
      WHEN user_lat IS NOT NULL AND user_lng IS NOT NULL THEN
        3959 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(user_lat))
            * cos(radians(v.latitude))
            * cos(radians(v.longitude) - radians(user_lng))
            + sin(radians(user_lat))
            * sin(radians(v.latitude))
          ))
        )
      ELSE NULL
    END AS distance_miles
  FROM venues v
  WHERE v.is_active = true
  ORDER BY
    CASE WHEN user_lat IS NOT NULL AND user_lng IS NOT NULL THEN
      acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(user_lat))
          * cos(radians(v.latitude))
          * cos(radians(v.longitude) - radians(user_lng))
          + sin(radians(user_lat))
          * sin(radians(v.latitude))
        ))
      )
    ELSE 0 END ASC,
    v.name ASC;
$$;
