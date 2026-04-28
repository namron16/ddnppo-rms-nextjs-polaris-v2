'use client'
// app/page.tsx
// Root: redirect to /login or /admin/master when authenticated.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getDefaultAdminRoute } from '@/lib/adminRouteAccess'

export default function RootPage() {
  const { user } = useAuth()
  const router   = useRouter()

  useEffect(() => {
    if (!user) {
      router.replace('/login')
    } else {
      router.replace(getDefaultAdminRoute(user.role))
    }
  }, [user, router])

  return null
}
