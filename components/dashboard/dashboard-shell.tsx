'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppRole } from '@/lib/auth/roles';

type NavItem = { href: string; label: string; group: string };

const ROLE_NAV: Record<AppRole, NavItem[]> = {
  owner: [
    { href: '/owner', label: 'Overview', group: 'Performance' },
    { href: '/owner/sales', label: 'Sales', group: 'Performance' },
    { href: '/owner/debts', label: 'Debts', group: 'Performance' },
    { href: '/owner/reports', label: 'Reports', group: 'Intelligence' },
    { href: '/owner/reports/daily', label: 'Daily report', group: 'Intelligence' },
    { href: '/owner/purchases', label: 'Purchases', group: 'Operations' },
    { href: '/owner/expenses', label: 'Expenses', group: 'Operations' },
    { href: '/owner/inventory', label: 'Inventory', group: 'Operations' },
    { href: '/owner/menu', label: 'Menu', group: 'Operations' },
    { href: '/owner/operations', label: 'Reconciliation', group: 'Control' },
    { href: '/owner/users', label: 'Users', group: 'Administration' },
    { href: '/owner/settings', label: 'Settings', group: 'Administration' },
  ],
  waiter: [
    { href: '/waiter', label: 'Dashboard', group: 'Service' },
    { href: '/waiter/pos', label: 'POS', group: 'Service' },
    { href: '/waiter/debts', label: 'Debts', group: 'Service' },
    { href: '/waiter/history', label: 'History', group: 'Service' },
  ],
  chef: [
    { href: '/chef', label: 'Dashboard', group: 'Kitchen' },
    { href: '/chef/opening-stock', label: 'Opening stock', group: 'Kitchen' },
    { href: '/chef/production', label: 'Production', group: 'Kitchen' },
    { href: '/chef/expenses', label: 'Expenses', group: 'Kitchen' },
  ],
  manager: [{ href: '/owner', label: 'Overview', group: 'Performance' }],
  cashier: [{ href: '/waiter', label: 'Overview', group: 'Service' }],
  accountant: [{ href: '/owner', label: 'Overview', group: 'Performance' }],
};

const roleLabel: Record<AppRole, string> = {
  owner: 'Owner control center',
  waiter: 'Waiter operations',
  chef: 'Kitchen operations',
  manager: 'Manager panel',
  cashier: 'Cashier panel',
  accountant: 'Accounting panel',
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
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const grouped = useMemo(() => {
    const nav = ROLE_NAV[role];
    const byGroup = new Map<string, NavItem[]>();
    for (const item of nav) {
      byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
    }
    return byGroup;
  }, [role]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <p className="brand-tag">Fryva Hospitality Ops</p>
            <h1 className="page-title">{title}</h1>
            <p className="page-description">{description}</p>
          </div>
          <div className="app-header-actions">
            <span className="status-chip status-info">{roleLabel[role]}</span>
            <button type="button" className="btn btn-secondary mobile-nav-toggle" onClick={() => setMobileNavOpen((prev) => !prev)} aria-expanded={mobileNavOpen}>
              {mobileNavOpen ? 'Close menu' : 'Menu'}
            </button>
            <form action="/auth/logout" method="post">
              <button className="btn btn-secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {mobileNavOpen ? <button aria-label="Close navigation" className="sidebar-overlay" onClick={() => setMobileNavOpen(false)} /> : null}
      <div className="app-grid">
        <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`} aria-label="Role navigation">
          <p className="sidebar-group-title">{role} navigation</p>
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <p className="sidebar-group-title">{group}</p>
              <nav>
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
                      <span className="nav-icon" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </aside>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
