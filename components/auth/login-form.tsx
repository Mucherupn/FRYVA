'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_ROLES, DASHBOARD_HOME, type AppRole } from '@/lib/auth/roles';

export function LoginForm() {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      setError('User session not found after login.');
      return;
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('user_role_assignments')
      .select('role')
      .eq('user_id', user.id)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError || !assignment?.role) {
      setLoading(false);
      setError('No assigned role found. Contact an owner.');
      return;
    }

    const role = assignment.role as AppRole;
    if (!APP_ROLES.includes(role)) {
      setLoading(false);
      setError('Invalid role assignment found. Contact an owner.');
      return;
    }

    router.replace(DASHBOARD_HOME[role]);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Fryva Login</h1>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Email</label>
        <input
          required
          type="email"
          className="w-full rounded border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@fryva.app"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Password</label>
        <input
          required
          type="password"
          className="w-full rounded border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
