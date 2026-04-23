'use client'
// hooks/useRealtimeSpecialOrders.ts
// Realtime updates for the Admin Orders page.
//
// Usage inside AdminOrdersPage after state is initialised:
//   useRealtimeSpecialOrders({ setOrders, setAttachmentsMap })

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

interface SOAttachment {
  id: string
  special_order_id: string
  parent_attachment_id: string | null
  file_name: string
  file_url: string
  file_size: string
  file_type: string
  uploaded_at: string
  uploaded_by: string
  archived: boolean
}

function normaliseOrder(row: any): SOWithUrl {
  return {
    id: row.id,
    reference: row.reference,
    subject: row.subject,
    date: row.date,
    attachments: row.attachments ?? 0,
    status: row.status,
    fileUrl: row.file_url ?? undefined,
  }
}

function normaliseAtt(row: any): SOAttachment {
  return {
    id: row.id,
    special_order_id: row.special_order_id,
    parent_attachment_id: row.parent_attachment_id ?? null,
    file_name: row.file_name,
    file_url: row.file_url,
    file_size: row.file_size,
    file_type: row.file_type,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
    archived: row.archived === true,
  }
}

interface Options {
  setOrders: React.Dispatch<React.SetStateAction<any[]>>
  setAttachmentsMap: React.Dispatch<React.SetStateAction<Map<string, SOAttachment[]>>>
}

export function useRealtimeSpecialOrders({ setOrders, setAttachmentsMap }: Options) {
  const setOrdersRef = useRef(setOrders)
  const setAttsRef = useRef(setAttachmentsMap)
  useEffect(() => { setOrdersRef.current = setOrders }, [setOrders])
  useEffect(() => { setAttsRef.current = setAttachmentsMap }, [setAttachmentsMap])

  useEffect(() => {
    // ── Orders ─────────────────────────────────────
    const ordersChannel = supabase
      .channel('rt_special_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'special_orders' }, payload => {
        const order = normaliseOrder(payload.new)
        if (order.status === 'ARCHIVED') return
        setOrdersRef.current(prev => {
          if (prev.some(o => o.id === order.id)) return prev
          return [order, ...prev]
        })
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

    // ── Attachments ────────────────────────────────
    const attsChannel = supabase
      .channel('rt_so_attachments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'special_order_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        const mapKey = att.parent_attachment_id ?? att.special_order_id
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
          for (const [k, list] of next) {
            if (list.some(a => a.id === att.id)) {
              next.set(k, list.map(a => a.id === att.id ? att : a))
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
  }, [])
}