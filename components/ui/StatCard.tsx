// components/ui/StatCard.tsx
// Summary stat card used at the top of the admin Master Documents page.

interface StatCardProps {
  icon: string
  value: number | string
  label: string
  bgColor: string   // Tailwind bg class e.g. 'bg-blue-50'
}

export function StatCard({ icon, value, label, bgColor }: StatCardProps) {
  return (
    <div className="bg-white border-[1.5px] border-slate-200 rounded-xl px-6 py-5 flex items-center gap-4">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center text-2xl flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <div className="text-3xl font-extrabold text-slate-800 leading-none">{value}</div>
        <div className="text-xs text-slate-400 mt-1">{label}</div>
      </div>
    </div>
  )
}
