'use client'
// components/ui/UploadGuard.tsx
// Wraps any upload trigger — hides/disables if current user is not P1
// Use this around every "+ Upload", "+ Add", "+ New" button

import { useAuth } from '@/lib/auth'
import { canUploadDocuments } from '@/lib/permissions'

interface UploadGuardProps {
  /** The upload button / trigger to protect */
  children: React.ReactNode
  /** If true, shows disabled state instead of hiding entirely */
  showDisabled?: boolean
  /** Custom tooltip for non-P1 users */
  disabledTooltip?: string
}

/**
 * UploadGuard — renders children only for P1.
 * Other roles see nothing (or an optional disabled state).
 *
 * Usage:
 *   <UploadGuard>
 *     <Button onClick={modal.open}>+ Upload Document</Button>
 *   </UploadGuard>
 */
export function UploadGuard({
  children,
  showDisabled = false,
  disabledTooltip = 'Only the Records Officer (P1) can upload documents.',
}: UploadGuardProps) {
  const { user } = useAuth()

  // P1 → render normally
  if (user && canUploadDocuments(user.role)) {
    return <>{children}</>
  }

  // Non-P1 with showDisabled → show grayed-out tooltip
  if (showDisabled) {
    return (
      <div
        className="relative group inline-flex"
        title={disabledTooltip}
      >
        <div className="opacity-30 pointer-events-none select-none cursor-not-allowed">
          {children}
        </div>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
          <div className="bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
            🔒 {disabledTooltip}
          </div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 mx-auto" />
        </div>
      </div>
    )
  }

  // Default: hide entirely for non-P1
  return null
}

// ── useUploadPermission hook ──────────────────
/**
 * Returns whether the current user can upload.
 * Use in page logic when you need the boolean directly.
 */
export function useUploadPermission(): boolean {
  const { user } = useAuth()
  return !!(user && canUploadDocuments(user.role))
}