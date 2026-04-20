import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AppRole } from '@/lib/auth/roles';

type NavItem = { href: string; label: string };

const ROLE_NAV: Record<AppRole, NavItem[]> = {
  owner: [
    { href: '/owner', label: 'Overview' },
    { href: '/owner/sales', label: 'Sales' },
    { href: '/owner/debts', label: 'Debts' },
    { href: '/owner/purchases', label: 'Purchases' },
    { href: '/owner/expenses', label: 'Expenses' },
    { href: '/owner/reports', label: 'Reports' },
    { href: '/owner/reports/daily', label: 'Daily report' },
    { href: '/owner/inventory', label: 'Inventory' },
    { href: '/owner/users', label: 'Users' },
    { href: '/owner/operations', label: 'Operations' },
  ],
  waiter: [
    { href: '/waiter', label: 'Overview' },
    { href: '/waiter/pos', label: 'POS' },
    { href: '/waiter/debts', label: 'Debts' },
    { href: '/waiter/history', label: 'History' },
  ],
  chef: [
    { href: '/chef', label: 'Overview' },
    { href: '/chef/opening-stock', label: 'Opening stock' },
    { href: '/chef/production', label: 'Production' },
    { href: '/chef/expenses', label: 'Expenses' },
  ],
  manager: [{ href: '/owner', label: 'Overview' }],
  cashier: [{ href: '/waiter', label: 'Overview' }],
  accountant: [{ href: '/owner', label: 'Overview' }],
};

export function DashboardShell({
  role,
  title,
  description,
  children,
}: {
  role: AppRole;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Fryva POS</p>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          <form action="/auth/logout" method="post">
            <button className="rounded border px-3 py-2 text-sm">Sign out</button>
          </form>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl gap-6 p-4 md:grid-cols-[220px_1fr] md:p-6">
        <aside className="rounded-lg border bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-slate-500">{role} panel</p>
          <nav className="space-y-2">
            {ROLE_NAV[role].map((item) => (
              <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="rounded-lg border bg-white p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
