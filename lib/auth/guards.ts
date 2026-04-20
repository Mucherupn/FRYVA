import { redirect } from 'next/navigation';
import type { AppRole } from './roles';
import { APP_ROLES, DASHBOARD_HOME } from './roles';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AuthContext = {
  userId: string;
  activeRole: AppRole;
};

function isAppRole(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

async function resolveCurrentUserRole(userId: string): Promise<AppRole | null> {
  const supabase = await createServerSupabaseClient();
  const { data: assignments, error } = await supabase
    .from('user_role_assignments')
    .select('role')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })
    .limit(1);

  if (error || !assignments?.length) {
    return null;
  }

  const candidate = assignments[0].role;
  return isAppRole(candidate) ? candidate : null;
}

export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = await resolveCurrentUserRole(user.id);

  if (!role) {
    redirect('/login?error=no_role');
  }

  return {
    userId: user.id,
    activeRole: role,
  };
}

export async function requireRole(allowedRoles: AppRole[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!allowedRoles.includes(auth.activeRole)) {
    redirect(DASHBOARD_HOME[auth.activeRole]);
  }
  return auth;
}
