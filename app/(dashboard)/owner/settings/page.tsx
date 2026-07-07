import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function Page() {
  await requireRole(['owner']);

  return (
    <DashboardShell role="owner" title="Owner settings" description="Phase 1 scaffold for /owner/settings.">
      <p className="text-sm text-slate-700">This module is scaffolded and will be implemented in upcoming phases.</p>
    <section className="panel"><h2 className="section-title">Operational data reset</h2><p className="section-subtitle">Owner-only dangerous tool for clearing sales and operational records while preserving users, menu and settings.</p><a className="btn btn-danger" href="/owner/settings/data-reset" style={{ marginTop: 12 }}>Open data reset</a></section></DashboardShell>
  );
}
