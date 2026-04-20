import { redirect } from 'next/navigation';
import type { AppRole } from './roles';
import { DASHBOARD_HOME } from './roles';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AuthContext = {
  userId: string;
  activeRole: AppRole;
};

export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: assignments, error } = await supabase
    .from('user_role_assignments')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);

  if (error || !assignments || assignments.length === 0) {
    redirect('/login?error=no_role');
  }

  return {
    userId: user.id,
    activeRole: assignments[0].role,
  };
}

export async function requireRole(allowedRoles: AppRole[]): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!allowedRoles.includes(auth.activeRole)) {
    redirect(DASHBOARD_HOME[auth.activeRole]);
  }
  return auth;
}
