// components/ui/EmptyState.tsx
// ─────────────────────────────────────────────
// Displayed when a table or list has no items
// (empty data or no search results).

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 mb-5 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}
