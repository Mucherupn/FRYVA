import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ROUTE_ROLE_REQUIREMENTS, type AppRole, APP_ROLES, DASHBOARD_HOME } from '@/lib/auth/roles';
import { createServerClient } from '@supabase/ssr';

const AUTH_PREFIXES = ['/owner', '/waiter', '/chef'];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // no-op in middleware guard branch
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('user_role_assignments')
    .select('role')
    .eq('user_id', user.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const role = assignment?.role as AppRole | undefined;
  if (assignmentError || !role || !APP_ROLES.includes(role)) {
    return NextResponse.redirect(new URL('/login?error=no_role', request.url));
  }

  const matched = ROUTE_ROLE_REQUIREMENTS.find((rule) => pathname.startsWith(rule.prefix));
  if (!matched) {
    return response;
  }

  if (!matched.roles.includes(role)) {
    return NextResponse.redirect(new URL(DASHBOARD_HOME[role], request.url));
  }

  return response;
}

export const config = {
  matcher: ['/owner/:path*', '/waiter/:path*', '/chef/:path*'],
};
