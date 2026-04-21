'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

async function findOrCreateCategory(categoryName?: string) {
  if (!categoryName?.trim()) return null;
  const supabase = await createServerSupabaseClient();
  const normalized = normalizeName(categoryName);
  const { data: existing } = await supabase.from('menu_categories').select('id').eq('name', normalized).maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase.from('menu_categories').insert({ name: normalized, active: true }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

function revalidateMenuPaths() {
  revalidatePath('/owner/menu');
  revalidatePath('/owner/purchases');
  revalidatePath('/waiter/pos');
  revalidatePath('/chef/opening-stock');
  revalidatePath('/chef/production');
}

export async function createMenuItemAction(payload: {
  name: string;
  selling_price: number;
  category_name?: string;
  sort_order?: number;
  stock_tracked?: boolean;
  item_type?: 'kitchen_prepared' | 'resale';
  active?: boolean;
  available?: boolean;
}) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();

  const itemName = normalizeName(payload.name);
  if (!itemName) return { ok: false, error: 'Item name is required.' };
  if (Number(payload.selling_price) < 0) return { ok: false, error: 'Price must be zero or higher.' };

  try {
    const category_id = await findOrCreateCategory(payload.category_name);
    const { error } = await supabase.from('menu_items').insert({
      name: itemName,
      category_id,
      selling_price: Number(payload.selling_price),
      stock_tracked: Boolean(payload.stock_tracked),
      kitchen_item: (payload.item_type ?? 'kitchen_prepared') === 'kitchen_prepared',
      item_type: payload.item_type ?? 'kitchen_prepared',
      active: payload.active ?? true,
      available: payload.available ?? true,
      sort_order: payload.sort_order ?? 0,
    });

    if (error) return { ok: false, error: error.message };
    revalidateMenuPaths();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message ?? 'Failed to create menu item.' };
  }
}

export async function updateMenuItemAction(payload: {
  id: number;
  name: string;
  selling_price: number;
  category_name?: string;
  sort_order?: number;
  stock_tracked?: boolean;
  item_type?: 'kitchen_prepared' | 'resale';
  active?: boolean;
  available?: boolean;
}) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();

  const itemName = normalizeName(payload.name);
  if (!itemName) return { ok: false, error: 'Item name is required.' };
  if (Number(payload.selling_price) < 0) return { ok: false, error: 'Price must be zero or higher.' };

  try {
    const category_id = await findOrCreateCategory(payload.category_name);
    const { error } = await supabase.from('menu_items').update({
      name: itemName,
      category_id,
      selling_price: Number(payload.selling_price),
      stock_tracked: Boolean(payload.stock_tracked),
      kitchen_item: (payload.item_type ?? 'kitchen_prepared') === 'kitchen_prepared',
      item_type: payload.item_type ?? 'kitchen_prepared',
      active: payload.active ?? true,
      available: payload.available ?? true,
      sort_order: payload.sort_order ?? 0,
    }).eq('id', payload.id);

    if (error) return { ok: false, error: error.message };
    revalidateMenuPaths();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message ?? 'Failed to update menu item.' };
  }
}

export async function deleteMenuItemAction(id: number) {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();

  const dependencyChecks = await Promise.all([
    supabase.from('sale_items').select('id', { count: 'exact', head: true }).eq('menu_item_id', id),
    supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('menu_item_id', id),
    supabase.from('opening_stock_entries').select('id', { count: 'exact', head: true }).eq('menu_item_id', id),
    supabase.from('stock_production_entries').select('id', { count: 'exact', head: true }).eq('menu_item_id', id),
  ]);

  const hasDependencies = dependencyChecks.some((check) => (check.count ?? 0) > 0);

  if (hasDependencies) {
    const { error } = await supabase.from('menu_items').update({ active: false, available: false }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidateMenuPaths();
    return { ok: true, archived: true };
  }

  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidateMenuPaths();
  return { ok: true, archived: false };
}
