/**
 * Legacy SkeletonLoader — re-exports from the new ShimmerLoader.
 * Keeps existing imports working without changes.
 */
export {
  default,
  VenueCardShimmer as VenueCardSkeleton,
  BeerCardShimmer as BeerCardSkeleton,
  OrderCardShimmer as OrderCardSkeleton,
} from '@/components/ui/ShimmerLoader';
