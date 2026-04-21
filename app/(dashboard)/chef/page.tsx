import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function ChefDashboardPage() {
  await requireRole(['chef', 'owner']);

  return (
    <DashboardShell role="chef" title="Chef dashboard" description="Practical kitchen controls for stock, production, and expense capture.">
      <section className="panel">
        <h2 className="section-title">Kitchen workflows</h2>
        <div className="list-stack">
          <Link href="/chef/opening-stock" className="row-card"><strong>Opening stock</strong><p className="section-subtitle">Bulk morning entry with revision-safe updates.</p></Link>
          <Link href="/chef/production" className="row-card"><strong>Production</strong><p className="section-subtitle">Fast prepared output logging throughout the shift.</p></Link>
          <Link href="/chef/expenses" className="row-card"><strong>Kitchen expenses</strong><p className="section-subtitle">Capture kitchen spend linked to cash and Mpesa ledgers.</p></Link>
        </div>
      </section>
    </DashboardShell>
  );
}
