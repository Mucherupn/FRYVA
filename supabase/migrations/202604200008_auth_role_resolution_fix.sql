-- Fix role resolution bootstrap under RLS.
-- Root issue: public.current_user_has_role() relied on public.user_has_role(),
-- but user_has_role was SECURITY INVOKER and got blocked by RLS on
-- public.user_role_assignments during login.

create or replace function public.user_has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    where ura.user_id = _user_id
      and ura.role = _role
  );
$$;

revoke all on function public.user_has_role(uuid, public.app_role) from public;
grant execute on function public.user_has_role(uuid, public.app_role) to authenticated;
grant execute on function public.user_has_role(uuid, public.app_role) to service_role;

-- Ensure authenticated users can read their own role assignment directly.
drop policy if exists "user_role_assignments_owner_all" on public.user_role_assignments;

create policy "user_role_assignments_select_self_or_owner" on public.user_role_assignments
for select to authenticated
using (user_id = auth.uid() or public.current_user_has_role('owner'));

create policy "user_role_assignments_owner_insert" on public.user_role_assignments
for insert to authenticated
with check (public.current_user_has_role('owner'));

create policy "user_role_assignments_owner_update" on public.user_role_assignments
for update to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "user_role_assignments_owner_delete" on public.user_role_assignments
for delete to authenticated
using (public.current_user_has_role('owner'));
