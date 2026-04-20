import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function ChefDashboardPage() {
  await requireRole(['chef', 'owner']);

  return (
    <DashboardShell
      role="chef"
      title="Chef Dashboard"
      description="Opening stock and production forms are prepared for phased rollout."
    >
      <ul className="list-disc space-y-2 pl-6 text-sm text-slate-700">
        <li>Opening stock and production views will be added in the next phase.</li>
        <li>Kitchen expenses will share the same RLS-safe foundation from this phase.</li>
      </ul>
    </DashboardShell>
  );
}
