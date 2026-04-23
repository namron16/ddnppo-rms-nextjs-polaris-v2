// components/ui/PageHeader.tsx
// Sticky top header bar used on every admin page.

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  const date = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="bg-white border-b border-slate-200 px-8 h-14 flex items-center justify-between sticky top-0 z-50">
      <h1 className="text-[17px] font-bold text-slate-800">{title}</h1>
      <span className="text-sm text-slate-400">📅 {date}</span>
    </div>
  )
}
