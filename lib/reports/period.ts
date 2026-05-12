import { kenyaTodayDate } from '@/lib/time/kenya';

export type ReportPeriodKey = 'today' | 'last_7_days' | 'this_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'custom';

export type DateRange = {
  from: string;
  to: string;
  key: ReportPeriodKey;
  label: string;
};

function parseDateOnly(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function isoDateFromUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date: string, days: number) {
  const { year, month, day } = parseDateOnly(date);
  return isoDateFromUtc(new Date(Date.UTC(year, month - 1, day + days)));
}

function startOfMonthDate(date: string) {
  const { year, month } = parseDateOnly(date);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function startOfYearDate(date: string) {
  const { year } = parseDateOnly(date);
  return `${year}-01-01`;
}

function addMonthsStart(date: string, months: number) {
  const { year, month } = parseDateOnly(date);
  return isoDateFromUtc(new Date(Date.UTC(year, month - 1 + months, 1)));
}

export function resolveReportRange(params: {
  period?: string;
  date_from?: string;
  date_to?: string;
  today?: Date;
}): DateRange {
  const today = kenyaTodayDate(params.today);

  const period = (params.period as ReportPeriodKey | undefined) ?? 'last_7_days';

  if (period === 'custom' && params.date_from && params.date_to) {
    return { from: params.date_from, to: params.date_to, key: 'custom', label: 'Custom range' };
  }

  if (period === 'today') {
    return { from: today, to: today, key: 'today', label: 'Today' };
  }

  if (period === 'this_month') {
    return { from: startOfMonthDate(today), to: today, key: 'this_month', label: 'This month' };
  }

  if (period === 'last_3_months') {
    return { from: addMonthsStart(today, -2), to: today, key: 'last_3_months', label: 'Last 3 months' };
  }

  if (period === 'last_6_months') {
    return { from: addMonthsStart(today, -5), to: today, key: 'last_6_months', label: 'Last 6 months' };
  }

  if (period === 'this_year') {
    return { from: startOfYearDate(today), to: today, key: 'this_year', label: 'This year' };
  }

  return { from: addCalendarDays(today, -6), to: today, key: 'last_7_days', label: 'Last 7 days' };
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
