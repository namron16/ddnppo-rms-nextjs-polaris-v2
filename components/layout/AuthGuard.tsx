'use client'
// components/layout/AuthGuard.tsx

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { isAllowedAdminPath } from '@/lib/adminRouteAccess'
import type { SessionRole } from '@/lib/adminRouteAccess'
import { getDefaultAdminRoute } from '@/lib/adminRouteAccess'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface AuthGuardProps {
  requiredRole?: 'admin' | 'officer' | 'any'
  children: React.ReactNode
}

const LOADING_TIMEOUT_MS = 8_000

export function AuthGuard({ requiredRole = 'any', children }: AuthGuardProps) {
  const { user, isLoading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const [timedOut, setTimedOut] = useState(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Timeout safety net ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      // Resolved normally — clear any pending timer
      if (timerRef.current) clearTimeout(timerRef.current)
      setTimedOut(false)
      return
    }

    // isLoading === true — start the timeout
    timerRef.current = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isLoading])

  // ── Route guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Still loading and haven't timed out — wait
    if (isLoading && !timedOut) return

    // No user after loading completes (or timeout) → login
    if (!user) {
      router.replace('/login')
      return
    }

    // User exists but path is forbidden for their role → redirect to default
    if (pathname && !isAllowedAdminPath(pathname, user.role as SessionRole)) {
      router.replace(getDefaultAdminRoute(user.role as SessionRole))
    }
  }, [user, isLoading, timedOut, router, pathname])

  // ── Render logic ───────────────────────────────────────────────────────────

  // Still genuinely loading (not timed out)
  if (isLoading && !timedOut) {
    return <LoadingSpinner fullPage />
  }

  // Timed out but user IS present — don't redirect to login, just render
  // (profile may have loaded partially; the app can still function)
  if (timedOut && user) {
    // Fall through to render children below
  }

  // Timed out with no user — effect will redirect, show spinner while redirecting
  if (timedOut && !user) {
    return <LoadingSpinner fullPage />
  }

  // No user and not loading — effect will redirect, show spinner while redirecting
  if (!user) {
    return <LoadingSpinner fullPage />
  }

  // User on a forbidden path — show spinner while redirect settles
  if (pathname && !isAllowedAdminPath(pathname, user.role as SessionRole)) {
    return <LoadingSpinner fullPage />
  }

  return <>{children}</>
}