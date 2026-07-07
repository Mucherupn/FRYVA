'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type CheckoutItem = { menu_item_id: number; quantity: number };

type FinalizeSalePayload = {
  items: CheckoutItem[];
  payment_method: 'cash' | 'mpesa' | 'debt' | 'staff';
  note?: string;
  debtor_name?: string;
  debtor_phone?: string;
  debt_note?: string;
  staff_option?: 'Amo' | 'Tallia' | 'Eliza' | 'Kanjaa' | 'Others';
  staff_name?: string;
  staff_note?: string;
};

export async function finalizeSaleAction(payload: FinalizeSalePayload) {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('finalize_sale', { _payload: { ...payload, sold_by: auth.userId } });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/waiter');
  revalidatePath('/waiter/debts');
  revalidatePath('/waiter/pos');
  revalidatePath('/owner');
  revalidatePath('/owner/sales');
  revalidatePath('/owner/debts');
  revalidatePath('/owner/staff-meals');
  revalidatePath('/owner/stock-alerts');
  return { ok: true, data };
}
