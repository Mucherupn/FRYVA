import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function ChefDashboardPage() {
  await requireRole(['chef', 'owner']);

  return (
    <DashboardShell role="chef" title="Chef dashboard" description="Daily kitchen controls for opening stock, production, and expenses.">
      <ul className="list-disc space-y-2 pl-6 text-sm text-slate-700">
        <li><Link href="/chef/opening-stock" className="underline">Opening stock</Link> for daily bulk entry and same-day revision-safe updates.</li>
        <li><Link href="/chef/production" className="underline">Production</Link> for prepared/cooked output logging.</li>
        <li><Link href="/chef/expenses" className="underline">Kitchen expenses</Link> with ledger-safe payment capture.</li>
      </ul>
    </DashboardShell>
  );
}
