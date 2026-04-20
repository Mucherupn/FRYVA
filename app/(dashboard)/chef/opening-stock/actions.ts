'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function recordOpeningStockAction(payload: { entry_date: string; items: Array<{ menu_item_id: number; qty: number }>; note?: string }) {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_opening_stock', { _payload: payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/chef/opening-stock');
  revalidatePath('/owner');
  return { ok: true, data };
}
