'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function recordProductionAction(payload: { entry_date: string; menu_item_id: number; qty: number; note?: string }) {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_production_entry', { _payload: payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/chef/production');
  revalidatePath('/owner');
  return { ok: true, data };
}
