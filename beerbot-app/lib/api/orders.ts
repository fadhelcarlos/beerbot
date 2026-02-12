import { supabase } from '@/lib/supabase';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  Order,
  OrderWithDetails,
} from '@/types/api';

/**
 * Create a new order by calling the create-order Edge Function.
 * The Edge Function validates age verification, tap/venue status,
 * inventory, and temperature, then atomically creates the order
 * and decrements inventory via a database RPC.
 */
export async function createOrder(
  request: CreateOrderRequest,
): Promise<CreateOrderResponse> {
  const { data, error } = await supabase.functions.invoke<CreateOrderResponse>(
    'create-order',
    {
      method: 'POST',
      body: request,
    },
  );

  if (error) throw error;
  if (!data) throw new Error('No data returned from create-order');

  return data;
}

/**
 * Fetch a single order by ID. RLS ensures only the owning user
 * can read their own orders.
 */
export async function getOrder(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) throw error;
  return data as Order;
}

/**
 * Fetch the current user's order history with pagination.
 * Returns newest orders first.
 */
export async function getOrderHistory(params?: {
  limit?: number;
  offset?: number;
}): Promise<Order[]> {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as Order[];
}

/**
 * Fetch the current user's order history with joined beer and venue names.
 * Uses Supabase nested select for relational joins.
 * Returns newest orders first with cursor-based pagination.
 */
export async function getOrderHistoryWithDetails(params: {
  pageParam: number;
  limit?: number;
}): Promise<OrderWithDetails[]> {
  const limit = params.limit ?? 20;
  const offset = params.pageParam;

  const { data, error } = await supabase
    .from('orders')
    .select('*, beers (name, style), venues (name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return ((data ?? []) as Array<
    Order & {
      beers: { name: string; style: string } | null;
      venues: { name: string } | null;
    }
  >).map((row) => ({
    ...row,
    beer_name: row.beers?.name ?? 'Unknown Beer',
    beer_style: row.beers?.style ?? '',
    venue_name: row.venues?.name ?? 'Unknown Venue',
    beers: undefined as never,
    venues: undefined as never,
  }));
}
