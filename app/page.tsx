'use client'
// app/page.tsx
// Root: redirect to /login or /admin/master when authenticated.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function RootPage() {
  const { user } = useAuth()
  const router   = useRouter()

  useEffect(() => {
    if (!user) {
      router.replace('/login')
    } else {
      router.replace('/admin/master')
    }
  }, [user, router])

  return null
}
