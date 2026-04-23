'use client'
// app/error.tsx
// ─────────────────────────────────────────────
// Global error boundary shown when an unhandled
// runtime error occurs in any page.

import { useEffect } from 'react'
import { Button }    from '@/components/ui/Button'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // In production: log to Sentry / Datadog etc.
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h1>
        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
          An unexpected error occurred. If this keeps happening, please contact your system administrator.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-5 font-mono bg-slate-100 px-3 py-1.5 rounded">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.location.href = '/login'}>
            ← Go to Login
          </Button>
          <Button variant="primary" onClick={reset}>
            🔄 Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
