import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/reports/csv';

type ExportType = 'sales' | 'debts' | 'expenses' | 'purchases';

export async function GET(request: Request) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const url = new URL(request.url);
  const type = (url.searchParams.get('type') ?? 'sales') as ExportType;
  const dateFrom = url.searchParams.get('date_from') ?? new Date().toISOString().slice(0, 10);
  const dateTo = url.searchParams.get('date_to') ?? new Date().toISOString().slice(0, 10);
  const fromTs = `${dateFrom}T00:00:00`;
  const toTs = `${dateTo}T23:59:59`;

  let rows: Array<Record<string, unknown>> = [];

  if (type === 'sales') {
    const { data } = await supabase.from('sales').select('sale_number, sold_at, payment_method, total, sold_by').gte('sold_at', fromTs).lte('sold_at', toTs).order('sold_at', { ascending: false });
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  if (type === 'debts') {
    const { data } = await supabase.from('debts').select('created_at, original_amount, remaining_amount, status, assigned_waiter_id, debtors(full_name)').gte('created_at', fromTs).lte('created_at', toTs).order('created_at', { ascending: false });
    rows = (data ?? []).map((row: any) => ({ ...row, debtor_name: row.debtors?.full_name ?? '' }));
  }

  if (type === 'expenses') {
    const { data } = await supabase.from('expenses').select('expense_time, description, category, amount, payment_method, source').gte('expense_time', fromTs).lte('expense_time', toTs).order('expense_time', { ascending: false });
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  if (type === 'purchases') {
    const { data } = await supabase.from('purchases').select('purchase_date, item_name, menu_item_id, category, qty, unit, unit_cost, total_cost, payment_method, supplier').gte('purchase_date', dateFrom).lte('purchase_date', dateTo).order('purchase_date', { ascending: false });
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${type}-${dateFrom}-to-${dateTo}.csv"`,
    },
  });
}
