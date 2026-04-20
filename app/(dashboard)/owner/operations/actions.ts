'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function voidSaleAction(payload: { sale_id: string; reason: string }) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('correct_or_void_sale', { _payload: { ...payload, operation: 'void' } });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner/sales');
  revalidatePath('/owner/operations');
  revalidatePath('/owner');
  return { ok: true, data };
}

export async function voidExpenseAction(payload: { expense_id: string; reason: string }) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('correct_or_void_expense', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner/expenses');
  revalidatePath('/owner/operations');
  revalidatePath('/owner');
  return { ok: true, data };
}

export async function voidPurchaseAction(payload: { purchase_id: string; reason: string }) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('correct_or_void_purchase', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner/purchases');
  revalidatePath('/owner/operations');
  revalidatePath('/owner');
  return { ok: true, data };
}

export async function createReconciliationAction(payload: {
  recon_type: 'cash' | 'mpesa';
  actual_balance: number;
  note?: string;
  recon_date?: string;
}) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('create_reconciliation_session', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner/operations');
  return { ok: true, data };
}

export async function writeOffDebtAction(payload: { debt_id: string; reason: string }) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('write_off_debt', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner/debts');
  revalidatePath('/owner/operations');
  return { ok: true, data };
}

export async function closeDayAction(payload: { close_date: string; note?: string }) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('close_day', { _payload: payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/owner');
  revalidatePath('/owner/operations');
  return { ok: true, data };
}
