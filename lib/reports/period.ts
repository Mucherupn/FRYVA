export type ReportPeriodKey = 'today' | 'last_7_days' | 'this_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom';

export type DateRange = {
  from: string;
  to: string;
  key: ReportPeriodKey;
  label: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function resolveReportRange(params: {
  period?: string;
  date_from?: string;
  date_to?: string;
  today?: Date;
}): DateRange {
  const today = params.today ?? new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const period = (params.period as ReportPeriodKey | undefined) ?? 'last_7_days';

  if (period === 'custom' && params.date_from && params.date_to) {
    return { from: params.date_from, to: params.date_to, key: 'custom', label: 'Custom range' };
  }

  if (period === 'today') {
    const day = isoDate(to);
    return { from: day, to: day, key: 'today', label: 'Today' };
  }

  if (period === 'this_month') {
    return { from: isoDate(startOfMonth(to)), to: isoDate(to), key: 'this_month', label: 'This month' };
  }

  if (period === 'last_3_months') {
    const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 2, 1));
    return { from: isoDate(d), to: isoDate(to), key: 'last_3_months', label: 'Last 3 months' };
  }

  if (period === 'last_6_months') {
    const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
    return { from: isoDate(d), to: isoDate(to), key: 'last_6_months', label: 'Last 6 months' };
  }

  if (period === 'this_year') {
    return { from: isoDate(startOfYear(to)), to: isoDate(to), key: 'this_year', label: 'This year' };
  }

  const seven = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 6));
  return { from: isoDate(seven), to: isoDate(to), key: 'last_7_days', label: 'Last 7 days' };
}

export const REPORT_PERIOD_OPTIONS: Array<{ key: ReportPeriodKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'last_6_months', label: 'Last 6 months' },
  { key: 'this_year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];
