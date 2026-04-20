export type AgingBucket = 'today' | 'd1_7' | 'd8_30' | 'over30';

export function classifyDebtAging(createdAt: string | Date, now = new Date()): AgingBucket {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 0) return 'today';
  if (ageDays <= 7) return 'd1_7';
  if (ageDays <= 30) return 'd8_30';
  return 'over30';
}
