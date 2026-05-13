'use client'
// hooks/useRealtimeSpecialOrders.ts
// Realtime updates for the Admin Orders page.
// UPDATED: aligned to new special_order_attachments schema
//   parent_id (was parent_attachment_id)
//   title + file_name (was just file_name)
//   gdrive_url (was file_url)
//   gdrive_file_id (new, required)
//   pool_account_id (new, required)
//   file_size_bytes bigint (was file_size string)
//   mime_type (was file_type string)
//   created_at (was uploaded_at)
//   depth int (new)
//   archived + uploaded_by columns removed
//
// Usage inside AdminOrdersPage after state is initialised:
//   useRealtimeSpecialOrders({ setOrders, setAttachmentsMap, user })

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface SOWithUrl {
  id: string
  reference: string
  subject: string
  date: string
  attachments: number
  status: string
  fileUrl?: string
}

// Aligned to new special_order_attachments schema
interface SOAttachment {
  id: string
  special_order_id: string
  parent_id: string | null          // was parent_attachment_id
  depth: number                     // new
  title: string                     // new – display name
  file_name: string | null          // now nullable
  file_size_bytes: number | null    // was file_size: string
  mime_type: string | null          // was file_type: string
  gdrive_file_id: string            // new
  gdrive_url: string                // was file_url
  pool_account_id: string           // new
  created_at: string                // was uploaded_at
  // NOTE: archived + uploaded_by removed from schema
}

function normaliseOrder(row: any): SOWithUrl {
  return {
    id:          row.id,
    reference:   row.reference,
    subject:     row.subject,
    date:        row.date,
    attachments: row.attachments ?? 0,
    status:      row.status,
    fileUrl:     row.file_url ?? undefined,
  }
}

function normaliseAtt(row: any): SOAttachment {
  return {
    id:               row.id,
    special_order_id: row.special_order_id,
    parent_id:        row.parent_id ?? null,
    depth:            row.depth ?? 0,
    title:            row.title ?? '',
    file_name:        row.file_name ?? null,
    file_size_bytes:  row.file_size_bytes ?? null,
    mime_type:        row.mime_type ?? null,
    gdrive_file_id:   row.gdrive_file_id,
    gdrive_url:       row.gdrive_url,
    pool_account_id:  row.pool_account_id,
    created_at:       row.created_at,
  }
}

interface Options {
  setOrders: React.Dispatch<React.SetStateAction<any[]>>
  setAttachmentsMap: React.Dispatch<React.SetStateAction<Map<string, SOAttachment[]>>>
  user: { role: string } | null
}

export function useRealtimeSpecialOrders({ setOrders, setAttachmentsMap, user }: Options) {
  const setOrdersRef = useRef(setOrders)
  const setAttsRef   = useRef(setAttachmentsMap)
  useEffect(() => { setOrdersRef.current = setOrders },    [setOrders])
  useEffect(() => { setAttsRef.current   = setAttachmentsMap }, [setAttachmentsMap])

  useEffect(() => {
    // ── Orders ──────────────────────────────────────────────────────────
    const ordersChannel = supabase
      .channel('rt_special_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'special_orders' }, payload => {
        const order = normaliseOrder(payload.new)
        if (order.status === 'ARCHIVED') return
        setOrdersRef.current(prev => {
          if (prev.some(o => o.id === order.id)) return prev
          return [order, ...prev]
        })
        // Seed an empty bucket for the new order
        setAttsRef.current(prev => {
          if (prev.has(order.id)) return prev
          const next = new Map(prev)
          next.set(order.id, [])
          return next
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'special_orders' }, payload => {
        const row = payload.new as any
        if (row.status === 'ARCHIVED') {
          setOrdersRef.current(prev => prev.filter(o => o.id !== row.id))
          return
        }
        setOrdersRef.current(prev => prev.map(o =>
          o.id === row.id ? normaliseOrder(row) : o
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'special_orders' }, payload => {
        const row = payload.old as any
        setOrdersRef.current(prev => prev.filter(o => o.id !== row.id))
      })
      .subscribe()

    // ── Attachments ─────────────────────────────────────────────────────
    const attsChannel = supabase
      .channel('rt_so_attachments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'special_order_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        // Index by parent_id if present, else by special_order_id
        const mapKey = att.parent_id ?? att.special_order_id
        setAttsRef.current(prev => {
          const next = new Map(prev)
          const existing = next.get(mapKey) ?? []
          if (existing.some(a => a.id === att.id)) return prev
          next.set(mapKey, [...existing, att])
          return next
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'special_order_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        setAttsRef.current(prev => {
          const next = new Map(prev)
          // Update in whichever bucket holds this attachment ID
          for (const [k, list] of next) {
            if (list.some(a => a.id === att.id)) {
              next.set(k, list.map(a => a.id === att.id ? att : a))
            }
          }
          return next
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'special_order_attachments' }, payload => {
        const row = payload.old as any
        setAttsRef.current(prev => {
          const next = new Map(prev)
          // Remove from whichever bucket holds this attachment ID
          for (const [k, list] of next) {
            if (list.some(a => a.id === row.id)) {
              next.set(k, list.filter(a => a.id !== row.id))
            }
          }
          return next
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(ordersChannel)
      void supabase.removeChannel(attsChannel)
    }
  }, [user])
}