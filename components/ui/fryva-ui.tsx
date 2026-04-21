import type { ReactNode } from 'react';

export function MetricCard({ label, value, span = 3 }: { label: string; value: ReactNode; span?: 3 | 4 | 6 | 12 }) {
  return (
    <article className={`kpi-card span-${span}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
    </article>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  const mapped = ['unpaid', 'overdue', 'partial', 'paid', 'voided', 'active', 'inactive', 'warning', 'success'].includes(normalized)
    ? normalized
    : 'info';
  return <span className={`status-chip status-${mapped}`}>{status.replace('_', ' ')}</span>;
}
