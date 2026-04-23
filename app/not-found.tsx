// app/not-found.tsx
// ─────────────────────────────────────────────
// 404 page shown when a route doesn't exist.

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">🔍</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h1>
        <p className="text-slate-500 text-sm mb-6">
          The page you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
        >
          ← Return to Login
        </Link>
      </div>
    </div>
  )
}
