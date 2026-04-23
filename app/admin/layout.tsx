'use client'
// app/admin/layout.tsx
// ─────────────────────────────────────────────
// Admin shell: AuthGuard + fixed Sidebar + main content area.
// Only users with role === 'admin' can access these routes.

import { AuthGuard } from '@/components/layout/AuthGuard'
import { Sidebar }   from '@/components/layout/Sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredRole="admin">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="main-offset flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
