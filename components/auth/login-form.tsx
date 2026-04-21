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

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

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
    <form onSubmit={handleSubmit} className="panel" style={{ maxWidth: 480, width: '100%', marginLeft: 'auto' }}>
      <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Welcome back</h2>
      <p className="section-subtitle" style={{ marginTop: 6 }}>Sign in to continue your shift and operations.</p>

      <div className="list-stack" style={{ marginTop: 18 }}>
        <div>
          <label className="section-subtitle" style={{ display: 'block', marginBottom: 6 }}>Email address</label>
          <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@fryva.app" />
        </div>

        <div>
          <label className="section-subtitle" style={{ display: 'block', marginBottom: 6 }}>Password</label>
          <input required type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
      </div>

      {error ? <p className="alert alert-error" style={{ marginTop: 12 }}>{error}</p> : null}

      <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: 14 }}>
        {loading ? 'Signing in...' : 'Sign in to Fryva'}
      </button>
    </form>
  );
}
