// components/ui/SearchInput.tsx
// ─────────────────────────────────────────────
// Controlled search input with magnifying-glass icon.
// Pairs with the useSearch() hook from hooks/index.ts.
//
// Usage:
//   const { query, setQuery, filtered } = useSearch(items, ['title'])
//   <SearchInput value={query} onChange={setQuery} placeholder="Search…" />

'use client'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 border-[1.5px] border-slate-200 rounded-lg text-[13.5px] bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          title="Clear"
        >
          ×
        </button>
      )}
    </div>
  )
}
