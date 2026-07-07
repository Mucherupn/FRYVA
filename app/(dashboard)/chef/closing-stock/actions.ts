'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export async function recordClosingStockAction(payload: { entry_date: string; items: Array<{ menu_item_id: number; qty: number }>; note?: string }) {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_closing_stock', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/chef/closing-stock'); revalidatePath('/chef/opening-stock'); revalidatePath('/owner'); revalidatePath('/owner/stock-alerts');
  return { ok: true, data };
}
