// components/ui/LoadingSpinner.tsx
// ─────────────────────────────────────────────
// Full-page loading spinner shown while auth
// state rehydrates from cookies on first render.

interface LoadingSpinnerProps {
  fullPage?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }

export function LoadingSpinner({ fullPage = false, size = 'md' }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={`${sizeMap[size]} border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin`}
    />
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        {spinner}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center p-8">
      {spinner}
    </div>
  )
}
