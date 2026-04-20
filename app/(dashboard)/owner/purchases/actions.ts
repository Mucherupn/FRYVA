'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function recordPurchaseAction(payload: {
  item_name: string;
  category?: string;
  qty: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  supplier?: string;
  payment_method: 'cash' | 'mpesa';
  note?: string;
  purchase_date: string;
}) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_purchase', { _payload: payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/owner/purchases');
  revalidatePath('/owner');
  return { ok: true, data };
}
