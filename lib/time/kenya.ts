export const KENYA_TIME_ZONE = 'Africa/Nairobi';

function partsForKenyaDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: KENYA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === 'year')?.value ?? '1970',
    month: parts.find((part) => part.type === 'month')?.value ?? '01',
    day: parts.find((part) => part.type === 'day')?.value ?? '01',
  };
}

export function kenyaTodayDate(now = new Date()) {
  const { year, month, day } = partsForKenyaDate(now);
  return `${year}-${month}-${day}`;
}

function parseDateOnly(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function kenyaMidnightUtc(date: string) {
  const { year, month, day } = parseDateOnly(date);
  return new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));
}

export function kenyaDayUtcRange(date: string) {
  const from = kenyaMidnightUtc(date);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  return { from: from.toISOString(), to: to.toISOString() };
}

export function kenyaDateRangeUtc(fromDate: string, toDate: string) {
  const from = kenyaMidnightUtc(fromDate);
  const to = new Date(kenyaMidnightUtc(toDate).getTime() + 24 * 60 * 60 * 1000);

  return { from: from.toISOString(), to: to.toISOString() };
}

export function kenyaDateFromTimestamp(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return kenyaTodayDate(date);
}

export function formatKenyaDateTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: KENYA_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatKenyaDisplayDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: KENYA_TIME_ZONE,
    dateStyle: 'medium',
  }).format(date);
}
