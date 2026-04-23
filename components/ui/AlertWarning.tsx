// components/ui/AlertWarning.tsx
// Yellow warning banner used on confidential pages.

interface AlertWarningProps {
  message: string
}

export function AlertWarning({ message }: AlertWarningProps) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
      <span className="flex-shrink-0 mt-0.5">⚠️</span>
      <span>{message}</span>
    </div>
  )
}
