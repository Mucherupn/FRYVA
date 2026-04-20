'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { AppRole } from '@/lib/auth/roles';

export async function createUserAction(formData: FormData) {
  const actor = await requireRole(['owner']);
  const email = String(formData.get('email') ?? '').trim();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const role = String(formData.get('role') ?? 'waiter') as AppRole;

  if (!email || !fullName) {
    throw new Error('Email and full name are required.');
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    throw new Error(error?.message || 'Failed to create user.');
  }

  const { error: roleError } = await supabaseAdmin.from('user_role_assignments').insert({
    user_id: data.user.id,
    role,
    assigned_by: actor.userId,
  });

  if (roleError) {
    throw new Error(roleError.message);
  }

  revalidatePath('/owner/users');
}

export async function updateUserRoleAction(formData: FormData) {
  const actor = await requireRole(['owner']);
  const userId = String(formData.get('user_id') ?? '').trim();
  const role = String(formData.get('role') ?? 'waiter') as AppRole;

  if (!userId) {
    throw new Error('User ID is required.');
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { error: deleteError } = await supabaseAdmin
    .from('user_role_assignments')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await supabaseAdmin.from('user_role_assignments').insert({
    user_id: userId,
    role,
    assigned_by: actor.userId,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath('/owner/users');
}
