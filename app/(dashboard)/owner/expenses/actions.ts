'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function recordOwnerExpenseAction(payload: {
  description: string;
  category?: string;
  amount: number;
  payment_method: 'cash' | 'mpesa';
  note?: string;
  expense_date: string;
}) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('record_expense', { _payload: { ...payload, source: 'owner' } });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/owner/expenses');
  revalidatePath('/owner');
  return { ok: true, data };
}
