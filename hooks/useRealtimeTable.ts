'use client'
// hooks/useRealtimeTable.ts
// Centralized Supabase Realtime hook — subscribes to INSERT/UPDATE/DELETE
// on any table and calls the appropriate callback.
//
// Usage:
//   useRealtimeTable('master_documents', {
//     onInsert: row => setDocs(prev => [mapRow(row), ...prev]),
//     onUpdate: row => setDocs(prev => prev.map(d => d.id === row.id ? mapRow(row) : d)),
//     onDelete: row => setDocs(prev => prev.filter(d => d.id !== row.id)),
//   })

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

type RowCallback = (row: Record<string, any>) => void

interface RealtimeOptions {
  onInsert?: RowCallback
  onUpdate?: RowCallback
  onDelete?: RowCallback
  /** Optional Postgres filter string, e.g. 'status=eq.ACTIVE' */
  filter?: string
  /** Unique channel suffix to avoid conflicts (defaults to table name) */
  channelSuffix?: string
  /** Set to false to disable the subscription without unmounting */
  enabled?: boolean
}

export function useRealtimeTable(
  table: string,
  options: RealtimeOptions
) {
  const { onInsert, onUpdate, onDelete, filter, channelSuffix, enabled = true } = options

  // Keep latest callbacks in refs so subscription closure doesn't go stale
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  const onDeleteRef = useRef(onDelete)
  useEffect(() => { onInsertRef.current = onInsert }, [onInsert])
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { onDeleteRef.current = onDelete }, [onDelete])

  useEffect(() => {
    if (!enabled) return

    const channelName = `rt_${table}_${channelSuffix ?? 'default'}`
    const base: Parameters<RealtimeChannel['on']>[1] = {
      event: '*',
      schema: 'public',
      table,
      ...(filter ? { filter } : {}),
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { ...base, event: 'INSERT' } as any,
        payload => {
          onInsertRef.current?.(payload.new as Record<string, any>)
        }
      )
      .on(
        'postgres_changes',
        { ...base, event: 'UPDATE' } as any,
        payload => {
          onUpdateRef.current?.(payload.new as Record<string, any>)
        }
      )
      .on(
        'postgres_changes',
        { ...base, event: 'DELETE' } as any,
        payload => {
          onDeleteRef.current?.(payload.old as Record<string, any>)
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [table, filter, channelSuffix, enabled])
}