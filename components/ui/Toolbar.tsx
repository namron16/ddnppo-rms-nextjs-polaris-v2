// components/ui/Toolbar.tsx
// ─────────────────────────────────────────────
// Reusable toolbar row: search input + filter dropdowns.
// ToolbarSelect accepts a standard onChange handler.

import { SelectHTMLAttributes } from 'react'

interface ToolbarProps {
  placeholder?: string
  children?: React.ReactNode
}

export function Toolbar({ children }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-wrap">
      {children}
    </div>
  )
}

export function ToolbarSelect({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="px-3 py-2 border-[1.5px] border-slate-200 rounded-lg text-[13px] bg-white text-slate-700 focus:outline-none cursor-pointer"
      style={{
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: '28px',
      }}
      {...props}
    >
      {children}
    </select>
  )
}
