export const APP_ROLES = [
  'owner',
  'waiter',
  'chef',
  'manager',
  'cashier',
  'accountant',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const DASHBOARD_HOME: Record<AppRole, string> = {
  owner: '/owner',
  waiter: '/waiter',
  chef: '/chef',
  manager: '/owner',
  cashier: '/waiter',
  accountant: '/owner',
};

export const ROUTE_ROLE_REQUIREMENTS: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: '/owner', roles: ['owner'] },
  { prefix: '/waiter', roles: ['waiter', 'owner'] },
  { prefix: '/chef', roles: ['chef', 'owner'] },
];
