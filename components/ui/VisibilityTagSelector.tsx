'use client'
// components/ui/VisibilityTagSelector.tsx
// P1-only multi-select for assigning document visibility to P2–P10

import { useState } from 'react'
import { VIEWER_ROLES, ROLE_META, canAssignVisibility } from '@/lib/permissions'
import { useAuth } from '@/lib/auth'
import type { AdminRole } from '@/lib/auth'

interface VisibilityTagSelectorProps {
  selected: AdminRole[]
  onChange: (roles: AdminRole[]) => void
  disabled?: boolean
  compact?: boolean
}

export function VisibilityTagSelector({
  selected,
  onChange,
  disabled = false,
  compact = false,
}: VisibilityTagSelectorProps) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(!compact)

  // Only P1 can interact with this
  const isAllowed = user && canAssignVisibility(user.role)

  function toggle(role: AdminRole) {
    if (!isAllowed || disabled) return
    if (selected.includes(role)) {
      onChange(selected.filter(r => r !== role))
    } else {
      onChange([...selected, role])
    }
  }

  function selectAll() {
    if (!isAllowed || disabled) return
    onChange([...VIEWER_ROLES])
  }

  function clearAll() {
    if (!isAllowed || disabled) return
    onChange([])
  }

  const allSelected = VIEWER_ROLES.every((r: AdminRole) => selected.includes(r))
  const noneSelected = selected.length === 0

  return (
    <div className={`rounded-xl border ${disabled || !isAllowed ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'} overflow-hidden`}>
      
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 ${compact ? 'cursor-pointer' : ''}`}
        onClick={compact ? () => setExpanded(v => !v) : undefined}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🏷️</span>
          <div>
            <p className="text-[12px] font-bold text-slate-700">Document Visibility Tags</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {selected.length === 0
                ? 'No P2–P10 selected — all viewers restricted'
                : selected.length === VIEWER_ROLES.length
                  ? 'All P2–P10 can view this document'
                  : `${selected.length} of ${VIEWER_ROLES.length} selected`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selected count badge */}
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            selected.length === 0 ? 'bg-red-100 text-red-600' :
            selected.length === VIEWER_ROLES.length ? 'bg-emerald-100 text-emerald-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {selected.length}/{VIEWER_ROLES.length}
          </span>
          {compact && (
            <span className="text-slate-400 text-sm font-bold">
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {(!compact || expanded) && (
        <div className="p-4">
          
          {/* Info notice for PD/DPDA/DPDO */}
          {!isAllowed && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <span className="text-blue-500 flex-shrink-0">ℹ️</span>
              <p className="text-[12px] text-blue-700">
                <strong>PD, DPDA, DPDO</strong> always have full access to all documents. Visibility tagging is managed by P1 only.
              </p>
            </div>
          )}

          {isAllowed && (
            <>
              {/* Quick actions */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={disabled || allSelected}
                  className="text-[11px] font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✓ Select All
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={disabled || noneSelected}
                  className="text-[11px] font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✕ Clear All
                </button>
                <span className="text-[11px] text-slate-400 ml-auto">
                  Click roles to toggle access
                </span>
              </div>

              {/* Role grid */}
              <div className="grid grid-cols-3 gap-2">
                {VIEWER_ROLES.map((role: AdminRole) => {
                  const meta = ROLE_META[role]
                  const isSelected = selected.includes(role)
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggle(role)}
                      disabled={disabled}
                      title={`${isSelected ? 'Revoke access from' : 'Grant access to'} ${meta.label}`}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-150 text-left ${
                        disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-current bg-opacity-10 shadow-sm cursor-pointer'
                            : 'border-slate-200 bg-white hover:border-slate-300 cursor-pointer hover:shadow-sm'
                      }`}
                      style={isSelected ? {
                        borderColor: meta.color,
                        backgroundColor: meta.color + '15',
                      } : {}}
                    >
                      {/* Avatar */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold flex-shrink-0 transition-transform group-hover:scale-110"
                        style={{ background: isSelected ? meta.color : '#cbd5e1' }}
                      >
                        {role.replace('P', '')}
                      </div>
                      
                      {/* Label */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-[12px] font-bold leading-none truncate ${isSelected ? 'text-slate-800' : 'text-slate-500'}`}>
                          {role}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {isSelected ? 'Full access' : 'Restricted'}
                        </p>
                      </div>
                      
                      {/* Checkmark */}
                      {isSelected && (
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: meta.color }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Always-visible: full-access roles notice */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium mb-1.5">Always have full access (not configurable):</p>
            <div className="flex flex-wrap gap-1.5">
              {['PD', 'DPDA', 'DPDO', 'P1'].map(role => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: ROLE_META[role as AdminRole].color + '20',
                    color: ROLE_META[role as AdminRole].color,
                    border: `1px solid ${ROLE_META[role as AdminRole].color}40`,
                  }}
                >
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: ROLE_META[role as AdminRole].color }} />
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}