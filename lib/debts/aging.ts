import { kenyaDateFromTimestamp } from '@/lib/time/kenya';

export type AgingBucket = 'today' | 'd1_7' | 'd8_30' | 'over30';

function dateOnlyUtcMs(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function classifyDebtAging(createdAt: string | Date, now = new Date()): AgingBucket {
  const createdDay = kenyaDateFromTimestamp(createdAt);
  const today = kenyaDateFromTimestamp(now);
  const ageDays = Math.floor((dateOnlyUtcMs(today) - dateOnlyUtcMs(createdDay)) / (1000 * 60 * 60 * 24));
  if (ageDays <= 0) return 'today';
  if (ageDays <= 7) return 'd1_7';
  if (ageDays <= 30) return 'd8_30';
  return 'over30';
}
