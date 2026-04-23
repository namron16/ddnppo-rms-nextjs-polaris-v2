// components/ui/Badge.tsx
// Generic badge pill with arbitrary className support.

import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide whitespace-nowrap',
        className
      )}
    >
      {children}
    </span>
  )
}
