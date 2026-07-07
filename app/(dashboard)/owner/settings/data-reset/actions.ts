'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export async function resetOperationalDataAction(confirmation: string) { await requireRole(['owner']); const supabase=await createServerSupabaseClient(); const { data, error } = await supabase.rpc('reset_operational_data', { _confirmation: confirmation }); if (error) return { ok:false, error:error.message }; ['/', '/owner','/owner/sales','/owner/debts','/owner/staff-meals','/owner/stock-alerts','/owner/expenses','/owner/purchases','/chef/opening-stock','/chef/production','/chef/closing-stock','/waiter','/waiter/debts'].forEach((path) => revalidatePath(path)); return { ok:true, data }; }
