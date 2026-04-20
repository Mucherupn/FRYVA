import test from 'node:test';
import assert from 'node:assert/strict';

function resolveReportRange(params) {
  const today = params.today ?? new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (d) => d.toISOString().slice(0, 10);
  const period = params.period ?? 'last_7_days';
  if (period === 'custom' && params.date_from && params.date_to) return { from: params.date_from, to: params.date_to, key: 'custom' };
  if (period === 'today') return { from: iso(to), to: iso(to), key: 'today' };
  if (period === 'this_month') return { from: iso(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))), to: iso(to), key: 'this_month' };
  const seven = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 6));
  return { from: iso(seven), to: iso(to), key: 'last_7_days' };
}

function classifyDebtAging(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 0) return 'today';
  if (ageDays <= 7) return 'd1_7';
  if (ageDays <= 30) return 'd8_30';
  return 'over30';
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const t = v == null ? '' : String(v);
    return t.includes(',') || t.includes('"') || t.includes('\n') ? `"${t.replaceAll('"', '""')}"` : t;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

test('reporting period resolution', () => {
  const range = resolveReportRange({ period: 'today', today: new Date('2026-04-20T08:00:00Z') });
  assert.equal(range.from, '2026-04-20');
  assert.equal(range.to, '2026-04-20');
});

test('debt aging classification', () => {
  const now = new Date('2026-04-20T00:00:00Z');
  assert.equal(classifyDebtAging('2026-04-20T00:00:00Z', now), 'today');
  assert.equal(classifyDebtAging('2026-04-15T00:00:00Z', now), 'd1_7');
  assert.equal(classifyDebtAging('2026-04-01T00:00:00Z', now), 'd8_30');
  assert.equal(classifyDebtAging('2026-02-01T00:00:00Z', now), 'over30');
});

test('csv escaping correctness', () => {
  const csv = toCsv([{ name: 'Client, One', note: 'Said "ok"' }]);
  assert.equal(csv, 'name,note\n"Client, One","Said ""ok"""');
});
