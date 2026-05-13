// PATCH: app/admin/master/useRealtimeMasterDocs.ts
// Drop-in realtime extension for the Master Documents page.
// UPDATED: aligned to new master_document_attachments schema
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

// Aligned to new master_document_attachments schema
interface DocAttachment {
  id: string
  document_id: string
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

function normalise(row: any): DocEnriched {
  return {
    id:                 row.id,
    title:              row.title,
    level:              row.level,
    type:               row.type,
    date:               row.date,
    size:               row.size,
    tag:                row.tag,
    fileUrl:            row.file_url ?? undefined,
    taggedAdminAccess:  Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : undefined,
    taggedRoles:        Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : [],
    canView:            true,
    isRestricted:       false,
  }
}

function normaliseAtt(row: any): DocAttachment {
  return {
    id:               row.id,
    document_id:      row.document_id,
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

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadInitialDocuments = async () => {
      const { data, error } = await supabase
        .from('master_documents')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading master documents:', error)
        return
      }

      const { data: archivedRows, error: archivedError } = await supabase
        .from('archived_docs')
        .select('id')

      if (archivedError) {
        console.error('Error loading archived master document ids:', archivedError)
      }

      const archivedIds = new Set(
        (archivedRows ?? [])
          .map((row: any) => String(row.id ?? ''))
          .filter((id: string) => id.startsWith('arc-md-'))
          .map((id: string) => id.replace('arc-md-', ''))
      )

      const docs = (data ?? [])
        .map(normalise)
        .filter(doc => !archivedIds.has(doc.id))

      setDocsRef.current(docs)
    }

    loadInitialDocuments()
  }, [user, isPrivileged])

  // ── Realtime subscriptions ────────────────────────────────────────────
  useEffect(() => {
    // ── Master documents ──────────────────────────────────────────────
    const docsChannel = supabase
      .channel('rt_master_documents')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.new as any
        if (row.archived) return
        const doc = normalise(row)
        setDocsRef.current(prev => {
          if (prev.some(d => d.id === doc.id)) return prev
          return [...prev, doc]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.new as any
        if (row.archived) {
          setDocsRef.current(prev => prev.filter(d => d.id !== row.id))
          return
        }
        setDocsRef.current(prev => prev.map(d =>
          d.id === row.id
            ? {
                ...d,
                title:             row.title,
                level:             row.level,
                type:              row.type,
                date:              row.date,
                tag:               row.tag,
                taggedAdminAccess: Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : undefined,
                taggedRoles:       Array.isArray(row.tagged_admin_access) ? row.tagged_admin_access : [],
              }
            : d
        ))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'master_documents' }, payload => {
        const row = payload.old as any
        setDocsRef.current(prev => prev.filter(d => d.id !== row.id))
      })
      .subscribe()

    // ── Attachments ───────────────────────────────────────────────────
    const attsChannel = supabase
      .channel('rt_master_doc_attachments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'master_document_attachments' }, payload => {
        const att = normaliseAtt(payload.new)
        // Index by parent_id if present, else by document_id
        const mapKey = att.parent_id ?? att.document_id
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
        const mapKey = att.parent_id ?? att.document_id
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'master_document_attachments' }, payload => {
        const row = payload.old as any
        setAttsRef.current(prev => {
          const next = new Map(prev)
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
      void supabase.removeChannel(docsChannel)
      void supabase.removeChannel(attsChannel)
    }
  }, [user, isPrivileged, isP1])
}