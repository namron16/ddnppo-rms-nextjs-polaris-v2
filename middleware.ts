// middleware.ts — Admin-only route protection
// No officer/user role. All routes require authenticated admin.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getDefaultAdminRoute, isAllowedAdminPath } from './lib/adminRouteAccess'
import type { SessionRole } from './lib/adminRouteAccess'

const PROTECTED = ['/admin']
const PUBLIC    = ['/login']
const VALID_SESSION_ROLES = new Set([
  'PD', 'DPDA', 'DPDO',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionRole  = request.cookies.get('rms_session')?.value
  const hasSession   = Boolean(sessionRole)
  const isLoggedIn   = Boolean(sessionRole && VALID_SESSION_ROLES.has(sessionRole))

  const redirectToLogin = () => {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    const response = NextResponse.redirect(loginUrl)

    // Clear stale cookies to prevent /login <-> /admin redirect loops.
    if (hasSession && !isLoggedIn) {
      response.cookies.delete('rms_session')
      response.cookies.delete('rms_role')
    }

    return response
  }

  // Redirect authenticated users away from login
  if (PUBLIC.some(p => pathname.startsWith(p))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(getDefaultAdminRoute(sessionRole as SessionRole), request.url))
    }
    // Allow unauthenticated access to /login
    // Also clear any stale session cookies if present
    if (hasSession && !isLoggedIn) {
      const response = NextResponse.next()
      response.cookies.delete('rms_session')
      response.cookies.delete('rms_role')
      return response
    }
    return NextResponse.next()
  }

  // Redirect unauthenticated users to login
  if (PROTECTED.some(p => pathname.startsWith(p)) && !isLoggedIn) {
    return redirectToLogin()
  }

  // Redirect authenticated users away from unauthorized admin paths.
  if (PROTECTED.some(p => pathname.startsWith(p)) && isLoggedIn) {
    const role = sessionRole as SessionRole
    if (pathname === '/admin') {
      return NextResponse.redirect(new URL(getDefaultAdminRoute(role), request.url))
    }

    if (!isAllowedAdminPath(pathname, role)) {
      return NextResponse.redirect(new URL(getDefaultAdminRoute(role), request.url))
    }
  }

  // Redirect root to login or admin
  if (pathname === '/') {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(getDefaultAdminRoute(sessionRole as SessionRole), request.url))
    }
    return redirectToLogin()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/login',
    '/',
  ],
}