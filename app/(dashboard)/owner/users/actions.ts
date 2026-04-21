'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { APP_ROLES, type AppRole } from '@/lib/auth/roles';
import type { CreateStaffFormState } from './state';

function isAppRole(role: string): role is AppRole {
  return APP_ROLES.includes(role as AppRole);
}

const MIN_PASSWORD_LENGTH = 8;

export async function createUserAction(
  _prevState: CreateStaffFormState,
  formData: FormData,
): Promise<CreateStaffFormState> {
  const actor = await requireRole(['owner']);
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  const role = String(formData.get('role') ?? '').trim();

  const fieldErrors: CreateStaffFormState['fieldErrors'] = {};

  if (!fullName) {
    fieldErrors.full_name = 'Full name is required.';
  }

  if (!email) {
    fieldErrors.email = 'Email is required.';
  }

  if (!password) {
    fieldErrors.password = 'Password is required.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!confirmPassword) {
    fieldErrors.confirm_password = 'Confirm password is required.';
  } else if (password !== confirmPassword) {
    fieldErrors.confirm_password = 'Passwords do not match.';
  }

  if (!role || !isAppRole(role)) {
    fieldErrors.role = 'Please select a valid role.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: 'Please fix the highlighted fields and try again.',
      fieldErrors,
    };
  }

  const selectedRole = role as AppRole;
  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return {
      status: 'error',
      message: error?.message || 'Failed to create staff user.',
    };
  }

  try {
    const { error: roleError } = await supabaseAdmin.from('user_role_assignments').insert({
      user_id: data.user.id,
      role: selectedRole,
      assigned_by: actor.userId,
    });

    if (roleError) {
      throw new Error(roleError.message);
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: data.user.id,
        full_name: fullName,
        created_by: actor.userId,
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      throw new Error(profileError.message);
    }
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);

    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed to finish staff setup.',
    };
  }

  revalidatePath('/owner/users');

  return {
    status: 'success',
    message: 'Staff account created successfully.',
    createdUser: {
      fullName,
      email,
      role: selectedRole,
    },
  };
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
