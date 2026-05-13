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

// How long to wait before giving up on a stuck loading state.
// In practice the session resolves in < 1 s; 6 s is a generous safety net.
const LOADING_TIMEOUT_MS = 6_000

export function AuthGuard({ requiredRole = 'any', children }: AuthGuardProps) {
  const { user, isLoading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  // Escape hatch: if isLoading never resolves (e.g. a silent loadProfile failure)
  // we stop showing the spinner after LOADING_TIMEOUT_MS and redirect to /login.
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isLoading && !timedOut) {
      timerRef.current = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS)
    }
    if (!isLoading && timerRef.current) {
      clearTimeout(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isLoading, timedOut])

  useEffect(() => {
    // Still waiting for auth — don't redirect yet (unless we timed out).
    if (isLoading && !timedOut) return

    // Not logged in (or timed out waiting) → login page.
    if (!user) {
      router.replace('/login')
      return
    }

    // Logged in but the current path is not allowed for this role.
    // router.replace() replaces the history entry so the back button
    // cannot return to the forbidden URL.
    if (pathname && !isAllowedAdminPath(pathname, user.role as SessionRole)) {
      router.replace(getDefaultAdminRoute(user.role as SessionRole))
    }
  }, [user, isLoading, timedOut, router, pathname])

  // Show spinner while loading (but bail out after the timeout).
  if ((isLoading && !timedOut) || (!user && !timedOut)) {
    return <LoadingSpinner fullPage />
  }

  // At this point the user is authenticated. If the current path is still
  // unauthorized (the replace() above is async), render nothing while we wait
  // for the navigation to settle — avoids a flash of forbidden content.
  if (user && pathname && !isAllowedAdminPath(pathname, user.role as SessionRole)) {
    return <LoadingSpinner fullPage />
  }

  return <>{children}</>
}