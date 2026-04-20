'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type RecordDebtPaymentPayload = {
  debt_id: string;
  amount: number;
  payment_method: 'cash' | 'mpesa';
  note?: string;
};

export async function recordDebtPaymentAction(payload: RecordDebtPaymentPayload) {
  await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('record_debt_payment', {
    _payload: payload,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/waiter');
  revalidatePath('/waiter/debts');
  revalidatePath('/owner/debts');

  return { ok: true, data };
}
