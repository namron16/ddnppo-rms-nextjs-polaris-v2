'use client'
// components/ui/P1Guard.tsx
// Guards upload, edit, and archive actions so only P1 can perform them.
// Other roles see a tooltip explaining the restriction.
//
// Usage:
//   <P1Guard action="upload">
//     <Button onClick={handleUpload}>+ Upload</Button>
//   </P1Guard>
//
//   <P1Guard action="edit" showDisabled>
//     <Button>✏️ Edit</Button>
//   </P1Guard>

import { useAuth } from '@/lib/auth'
import { canUpload, canEdit, canArchive } from '@/lib/viewRequests'

type GuardedAction = 'upload' | 'edit' | 'archive' | 'any'

interface P1GuardProps {
  children: React.ReactNode
  action?: GuardedAction
  /** Show grayed-out disabled state instead of hiding entirely */
  showDisabled?: boolean
  /** Override tooltip text */
  disabledTooltip?: string
}

const ACTION_LABELS: Record<GuardedAction, string> = {
  upload: 'upload documents',
  edit: 'edit documents',
  archive: 'archive documents',
  any: 'perform this action',
}

function checkPermission(role: string, action: GuardedAction): boolean {
  switch (action) {
    case 'upload': return canUpload(role as any)
    case 'edit': return canEdit(role as any)
    case 'archive': return canArchive(role as any)
    case 'any': return role === 'P1'
    default: return false
  }
}

export function P1Guard({
  children,
  action = 'any',
  showDisabled = false,
  disabledTooltip,
}: P1GuardProps) {
  const { user } = useAuth()

  if (!user) return null

  // Allowed: render normally
  if (checkPermission(user.role, action)) {
    return <>{children}</>
  }

  // Not allowed + showDisabled: render grayed out with tooltip
  if (showDisabled) {
    const tooltip = disabledTooltip ??
      `Only the Records Officer (P1) can ${ACTION_LABELS[action]}.`

    return (
      <div className="relative group inline-flex" title={tooltip}>
        <div className="opacity-30 pointer-events-none select-none cursor-not-allowed">
          {children}
        </div>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap">
          <div className="bg-slate-900 text-white text-[11px] font-medium px-3 py-2 rounded-lg shadow-xl max-w-[220px] text-center leading-snug">
            🔒 {tooltip}
          </div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 mx-auto" />
        </div>
      </div>
    )
  }

  // Default: hide entirely
  return null
}

// ── Hook version for programmatic checks ──────

/**
 * Returns whether the current user can perform the given action.
 * Use this when you need the boolean directly in component logic.
 *
 * @example
 * const canUploadDocs = useP1Permission('upload')
 * if (!canUploadDocs) return <RestrictedMessage />
 */
export function useP1Permission(action: GuardedAction = 'any'): boolean {
  const { user } = useAuth()
  if (!user) return false
  return checkPermission(user.role, action)
}

// ── Role badge for UI display ──────────────────

interface P1OnlyBadgeProps {
  compact?: boolean
}

/**
 * Small badge indicating an action is P1-only.
 */
export function P1OnlyBadge({ compact = false }: P1OnlyBadgeProps) {
  if (compact) {
    return (
      <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
        P1
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
      🔒 P1 Only
    </span>
  )
}