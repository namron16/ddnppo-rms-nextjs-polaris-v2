// PATCH: app/admin/master/useRealtimeMasterDocs.ts
// Drop-in realtime extension for the Master Documents page.
// Import and call this hook inside MasterPage after state is initialised.
//
// Usage inside MasterPage:
//   import { useRealtimeMasterDocs } from './useRealtimeMasterDocs'
//   useRealtimeMasterDocs({ setDocuments, setAttachmentsMap, user, isPrivileged, isP1 })

'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AdminRole } from '@/lib/auth'

interface DocEnriched {
  id: string
  title: string
  level: string
  type: string
  date: string
  size: string
  tag: string
  fileUrl?: string
  taggedAdminAccess?: string[]
  taggedRoles?: AdminRole[]
  approval?: any
  canView?: boolean
  isRestricted: boolean
  children?: any[]
}

interface DocAttachment {
  id: string
  document_id: string
  parent_attachment_id: string | null
  file_name: string
  file_url: string
  file_size: string
  file_type: string
  uploaded_at: string
  uploaded_by: string
  archived: boolean
}

function normalise(row: any): DocEnriched {
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    type: row.type,
    date: row.date,
    size: row.size,
    tag: row.tag,
    fileUrl: row.file_url ?? undefined,
    taggedAdminAccess: Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : undefined,
    taggedRoles: Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : [],
    canView: true,
    isRestricted: false,
  }
}

function normaliseAtt(row: any): DocAttachment {
  return {
    id: row.id,
    document_id: row.document_id,
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
  setDocuments: React.Dispatch<React.SetStateAction<any[]>>
  setAttachmentsMap: React.Dispatch<React.SetStateAction<Map<string, DocAttachment[]>>>
  user: { role: string } | null
  isPrivileged: boolean
  isP1: boolean
}

export function useRealtimeMasterDocs({ setDocuments, setAttachmentsMap, user, isPrivileged, isP1 }: Options) {
  const setDocsRef = useRef(setDocuments)
  const setAttsRef = useRef(setAttachmentsMap)
  useEffect(() => { setDocsRef.current = setDocuments }, [setDocuments])
  useEffect(() => { setAttsRef.current = setAttachmentsMap }, [setAttachmentsMap])

  useEffect(() => {
    // ── Master documents ──────────────────────────
    const docsChannel = supabase
      .channel('rt_master_documents')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.new as any
        if (row.archived) return
        const doc = normalise(row)
        // P2-P10: check visibility before adding
        if (!isPrivileged && user) {
          const tagged: string[] = Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : []
          if (!tagged.includes(user.role)) {
            doc.canView = false
            doc.isRestricted = true
          }
        }
        setDocsRef.current(prev => {
          if (prev.some(d => d.id === doc.id)) return prev
          return [...prev, doc]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.new as any
        if (row.archived) {
          // Remove from list when archived
          setDocsRef.current(prev => prev.filter(d => d.id !== row.id))
          return
        }
        setDocsRef.current(prev => prev.map(d =>
          d.id === row.id
            ? {
                ...d,
                title: row.title,
                level: row.level,
                type: row.type,
                date: row.date,
                tag: row.tag,
                taggedAdminAccess: Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : undefined,
                taggedRoles: Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : [],
              }
            : d
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.old as any
        setDocsRef.current(prev => prev.filter(d => d.id !== row.id))
      })
      .subscribe()

    // ── Attachments ────────────────────────────────
    const attsChannel = supabase
      .channel('rt_master_doc_attachments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'master_document_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        const mapKey = att.parent_attachment_id ?? att.document_id
        setAttsRef.current(prev => {
          const next = new Map(prev)
          const existing = next.get(mapKey) ?? []
          if (existing.some(a => a.id === att.id)) return prev
          next.set(mapKey, [...existing, att])
          return next
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'master_document_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        const mapKey = att.parent_attachment_id ?? att.document_id
        setAttsRef.current(prev => {
          const next = new Map(prev)
          // Update in all possible keys (archived moves it from "visible" to hidden)
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
      void supabase.removeChannel(docsChannel)
      void supabase.removeChannel(attsChannel)
    }
  }, [user, isPrivileged, isP1])
}