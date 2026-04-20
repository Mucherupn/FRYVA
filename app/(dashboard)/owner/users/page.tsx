import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { APP_ROLES } from '@/lib/auth/roles';
import { createUserAction, updateUserRoleAction } from './actions';

export default async function OwnerUsersPage() {
  await requireRole(['owner']);
  const supabaseAdmin = createSupabaseAdminClient();

  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const userIds = users?.users.map((user) => user.id) ?? [];

  const { data: assignments } = userIds.length
    ? await supabaseAdmin
        .from('user_role_assignments')
        .select('user_id, role')
        .in('user_id', userIds)
    : { data: [] };

  const roleByUser = new Map((assignments ?? []).map((item) => [item.user_id, item.role]));

  return (
    <DashboardShell
      role="owner"
      title="User Management"
      description="Owner-only user provisioning and role assignment with Supabase Auth."
    >
      <section className="mb-8 rounded border p-4">
        <h2 className="mb-4 text-lg font-semibold">Create User</h2>
        <form action={createUserAction} className="grid gap-3 md:grid-cols-4">
          <input name="full_name" required placeholder="Full name" className="rounded border px-3 py-2" />
          <input name="email" required type="email" placeholder="Email" className="rounded border px-3 py-2" />
          <select name="role" className="rounded border px-3 py-2">
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button className="rounded bg-black px-3 py-2 text-white">Create</button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-4 text-lg font-semibold">Existing Users</h2>
        <div className="space-y-3">
          {(users?.users ?? []).map((user) => (
            <form key={user.id} action={updateUserRoleAction} className="grid items-center gap-2 rounded border p-3 md:grid-cols-4">
              <input type="hidden" name="user_id" value={user.id} />
              <div>
                <p className="text-sm font-medium">{user.user_metadata.full_name ?? user.email}</p>
                <p className="text-xs text-slate-600">{user.email}</p>
              </div>
              <p className="text-xs text-slate-600">{user.id}</p>
              <select name="role" defaultValue={roleByUser.get(user.id) ?? 'waiter'} className="rounded border px-3 py-2">
                {APP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button className="rounded border px-3 py-2 text-sm">Update Role</button>
            </form>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
