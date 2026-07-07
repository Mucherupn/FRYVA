'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
export async function reviewStockVarianceAction(payload: { business_date: string; menu_item_id: number; status: 'resolved' | 'unresolved'; review_note?: string }) { await requireRole(['owner']); const supabase = await createServerSupabaseClient(); const { data, error } = await supabase.rpc('review_stock_variance', { _payload: payload }); if (error) return { ok:false, error:error.message }; revalidatePath('/owner/stock-alerts'); return { ok:true, data }; }
