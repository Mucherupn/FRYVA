import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DataResetForm } from '@/components/owner/data-reset-form';
import { requireRole } from '@/lib/auth/guards';
export default async function Page() { await requireRole(['owner']); return <DashboardShell role="owner" title="Data Reset" description="Owner-only tool to clear operational data without deleting configuration."><DataResetForm /></DashboardShell>; }
