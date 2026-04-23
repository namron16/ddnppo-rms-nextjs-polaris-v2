'use client'
// components/ui/DepartmentBadge.tsx
// Reusable floating department/unit badge component

interface DepartmentBadgeProps {
  department?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'subtle'
  showIcon?: boolean
}

export function DepartmentBadge({
  department,
  size = 'md',
  variant = 'default',
  showIcon = true,
}: DepartmentBadgeProps) {
  if (!department || !department.trim()) return null

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-[11px] px-2.5 py-1',
    lg: 'text-[12px] px-3 py-1.5',
  }

  const variantClasses = {
    default: 'bg-blue-50 border border-blue-200 text-blue-700',
    outline: 'bg-white border border-blue-300 text-blue-600',
    subtle: 'bg-slate-100 border border-slate-200 text-slate-600',
  }

  return (
    <span
      className={`inline-block rounded-full font-medium whitespace-nowrap transition hover:opacity-80 ${
        sizeClasses[size]
      } ${variantClasses[variant]}`}
      title={`Department: ${department}`}
    >
      {showIcon && <span className="mr-1">🏢</span>}
      {department}
    </span>
  )
}

/**
 * Floating department note: displays as a small tooltip-style badge
 * Often used in table rows or card headers to show department at a glance
 */
export function DepartmentNote({ department }: { department?: string }) {
  if (!department || !department.trim()) return null

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />
      <span className="text-[10px] font-medium text-slate-600">
        {department}
      </span>
    </div>
  )
}

/**
 * Floating department label: displays as a floating label
 * used for quick visual reference without much space
 */
export function FloatingDepartmentLabel({ department }: { department?: string }) {
  if (!department || !department.trim()) return null

  return (
    <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[9px] font-bold rounded-full px-2 py-0.5 shadow-sm whitespace-nowrap">
      📌 {department}
    </div>
  )
}
