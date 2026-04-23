// lib/utils.ts
// ─────────────────────────────────────────────
// Shared utility functions used across components.

import { clsx, type ClassValue } from 'clsx'
import type { DocLevel, DocStatus, DocClassification, JournalType, LibraryCategory, LogAction } from '@/types'

/** Merge Tailwind class names conditionally. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** Returns Tailwind classes for a document level badge. */
export function levelBadgeClass(level: DocLevel): string {
  return {
    REGIONAL:   'bg-blue-100 text-blue-700',
    PROVINCIAL: 'bg-amber-100 text-amber-700',
    STATION:    'bg-emerald-100 text-emerald-700',
  }[level]
}

/** Returns Tailwind classes for a status badge. */
export function statusBadgeClass(status: DocStatus): string {
  return {
    ACTIVE:   'bg-emerald-100 text-emerald-700',
    ARCHIVED: 'bg-slate-200 text-slate-500',
  }[status]
}

/** Returns Tailwind classes for a classification badge. */
export function classificationBadgeClass(c: DocClassification): string {
  return {
    RESTRICTED:   'bg-red-100 text-red-700',
    CONFIDENTIAL: 'bg-fuchsia-100 text-fuchsia-700',
  }[c]
}

/** Returns Tailwind classes for a journal type badge. */
export function journalBadgeClass(type: JournalType): string {
  return {
    MEMO:   'bg-sky-100 text-sky-700',
    REPORT: 'bg-violet-100 text-violet-700',
    LOG:    'bg-emerald-100 text-emerald-700',
  }[type]
}

/** Returns Tailwind classes for a library category badge. */
export function libraryBadgeClass(cat: LibraryCategory): string {
  return {
    MANUAL:    'bg-amber-100 text-amber-700',
    GUIDELINE: 'bg-violet-100 text-violet-700',
    TEMPLATE:  'bg-sky-100 text-sky-700',
  }[cat]
}

/** Returns Tailwind classes for an activity log action. */
export function logActionClass(action: LogAction): string {
  return {
    Viewed:     'text-blue-600 font-semibold',
    Downloaded: 'text-emerald-600 font-semibold',
    Forwarded:  'text-amber-600 font-semibold',
  }[action]
}

/** Format a YYYY-MM-DD string to a readable date. */
export function formatDate(date: string): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

import type { Doc201Status } from '@/types'

/** Badge classes for a 201 document status. */
export function status201BadgeClass(status: Doc201Status): string {
  return {
    COMPLETE:   'bg-emerald-100 text-emerald-700',
    MISSING:    'bg-red-100 text-red-700',
    EXPIRED:    'bg-orange-100 text-orange-700',
    FOR_UPDATE: 'bg-amber-100 text-amber-700',
  }[status]
}

/** Icon for a 201 document status. */
export function status201Icon(status: Doc201Status): string {
  return {
    COMPLETE:   '✅',
    MISSING:    '❌',
    EXPIRED:    '⚠️',
    FOR_UPDATE: '🔄',
  }[status]
}
