import { InboxItem } from "@/types"
import { logAction } from "./adminLogger"
import { AdminRole } from "./auth"
import { supabase } from "./supabase"

export type DocumentType = 'master_document' | 'admin_order' | 'daily_journal' | 'library'

export interface ForwardAttachmentPayload {
  originalAttachmentId?: string
  parentAttachmentId?:   string
  depth:                 number
  title:                 string
  fileName?:             string
  fileSizeBytes?:        number
  mimeType?:             string
  gdriveFileId:          string
  gdriveUrl:             string
  poolAccountId:         string
}


export interface ForwardPayload {
  recipients:      string[]          // AdminRole[]
  originalDocId:   string
  documentType:    DocumentType
  title:           string
  notes?:          string
  gdriveFileId:    string
  gdriveUrl:       string
  poolAccountId:   string
  fileName?:       string
  fileSizeBytes?:  number
  mimeType?:       string
  attachments:     ForwardAttachmentPayload[]
}

export interface ForwardResult {
  success: boolean
  count:   number
  errors:  { recipient: string; error: string }[]
}

export interface AttachmentNode {
  id: string
  file_name: string
  file_url: string
  file_size: string
  file_type: string
  children: AttachmentNode[]  // recursive — preserves full hierarchy
}



/**
 * Sends the forward request to the API.
 * No GDrive upload happens here — only metadata is sent.
 */
export async function forwardDocument(payload: ForwardPayload): Promise<ForwardResult> {
  const res = await fetch('/api/forward', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  const json = await res.json()

  if (!res.ok) {
    return { success: false, count: 0, errors: [{ recipient: 'all', error: json.error ?? 'Request failed' }] }
  }

  return {
    success: json.success,
    count:   json.count,
    errors:  json.errors ?? [],
  }
}

/**
 * Flattens an attachment tree into the ForwardAttachmentPayload[] format.
 * Use this when building the payload from attachmentsMap.
 */
export function flattenAttachmentsForForward(
  docId: string,
  attachmentsMap: Map<string, any[]>
): ForwardAttachmentPayload[] {
  const flat: ForwardAttachmentPayload[] = []

  function walk(parentId: string, parentAttachmentId: string | undefined, depth: number) {
    const children = attachmentsMap.get(parentId) ?? []
    for (const att of children) {
      flat.push({
        originalAttachmentId: att.id,
        parentAttachmentId,
        depth,
        title:          att.title ?? att.file_name ?? 'Attachment',
        fileName:       att.file_name,
        fileSizeBytes:  att.file_size_bytes,
        mimeType:       att.mime_type,
        gdriveFileId:   att.gdrive_file_id,
        gdriveUrl:      att.gdrive_url,
        poolAccountId:  att.pool_account_id,
      })
      walk(att.id, att.id, depth + 1)
    }
  }

  walk(docId, undefined, 0)
  return flat
}


/**
 * Builds a nested attachment tree from a flat list.
 * Used in the inbox to reconstruct hierarchy for display.
 */
export function buildAttachmentTree(
  attachments: any[],
  parentId: string | null = null
): any[] {
  return attachments
    .filter(a => (a.parent_attachment_id ?? null) === parentId)
    .map(a => ({
      ...a,
      children: buildAttachmentTree(attachments, a.original_attachment_id ?? a.id),
    }))
}


export async function saveInboxItemToPage(
  inboxItemId: string,
  recipientId: AdminRole,
  targetPage: 'master' | 'admin_order' | 'daily_journal' | 'library'
): Promise<boolean> {
  // 1. Fetch the inbox item
  const { data, error } = await supabase
    .from('inbox_items')
    .select('*')
    .eq('id', inboxItemId)
    .eq('recipient_id', recipientId)
    .single()

  if (error || !data) return false

  const inboxItem = data as InboxItem
  const documentData = inboxItem.document_data || {}

  // 2. Insert into the appropriate table based on targetPage
  try {
    switch (targetPage) {
      case 'master': {
        const masterDoc = {
          id: inboxItem.document_id,
          title: documentData.title || inboxItem.document_title,
          level: documentData.level || 'REGIONAL',
          type: documentData.type || 'Document',
          date: documentData.date || new Date().toISOString().split('T')[0],
          size: documentData.size || '0 KB',
          tag: documentData.tag || '',
          file_url: inboxItem.file_url || null,
          tagged_admin_access: documentData.taggedAdminAccess || null,
        }

        const { error: insertError } = await supabase
          .from('master_documents')
          .insert(masterDoc)

        if (insertError) {
          console.error('Error saving to master_documents:', insertError)
          return false
        }
        break
      }

      case 'admin_order': {
        const adminOrder = {
          id: inboxItem.document_id,
          reference: documentData.reference || inboxItem.document_title,
          subject: documentData.subject || inboxItem.document_title,
          date: documentData.date || new Date().toISOString().split('T')[0],
          attachments: documentData.attachments || 0,
          status: documentData.status || 'ACTIVE',
          file_url: inboxItem.file_url || null,
        }

        const { error: insertError } = await supabase
          .from('special_orders')
          .insert(adminOrder)

        if (insertError) {
          console.error('Error saving to special_orders:', insertError)
          return false
        }

        // Handle attachments if they exist
        if (inboxItem.attachments && inboxItem.attachments !== '[]') {
          const attachments = JSON.parse(inboxItem.attachments)
          await saveAttachmentsToSpecialOrder(inboxItem.document_id, attachments, recipientId)
        }
        break
      }

      case 'daily_journal': {
        const journalEntry = {
          id: inboxItem.document_id,
          title: documentData.title || inboxItem.document_title,
          type: documentData.type || 'MEMO',
          author: documentData.author || recipientId,
          date: documentData.date || new Date().toISOString().split('T')[0],
          content: documentData.content || null,
          summary: documentData.summary || null,
          file_url: inboxItem.file_url || null,
          status: documentData.status || 'Draft',
          attachments: documentData.attachments || (inboxItem.file_url ? 1 : 0),
          archived: false,
          saved_by: recipientId,
        }

        const { error: insertError } = await supabase
          .from('daily_journals')
          .insert(journalEntry)

        if (insertError) {
          console.error('Error saving to daily_journals:', insertError)
          return false
        }
        break
      }

      case 'library': {
        const libraryItem = {
          id: inboxItem.document_id,
          title: documentData.title || inboxItem.document_title,
          category: documentData.category || 'TEMPLATE',
          size: documentData.size || '0 KB',
          date_added: documentData.dateAdded || new Date().toISOString(),
          file_url: inboxItem.file_url || null,
          description: documentData.description || null,
          saved_by: recipientId,
        }

        const { error: insertError } = await supabase
          .from('library_items')
          .insert(libraryItem)

        if (insertError) {
          console.error('Error saving to library_items:', insertError)
          return false
        }
        break
      }

      default:
        console.error('Unknown target page:', targetPage)
        return false
    }

    // 3. Mark inbox item as saved
    const { error: updateError } = await supabase
      .from('inbox_items')
      .update({
        status: 'saved',
        saved_to: targetPage,
        saved_at: new Date().toISOString()
      })
      .eq('id', inboxItemId)

    if (updateError) {
      console.error('Error updating inbox item status:', updateError)
      return false
    }

    return true
  } catch (err) {
    console.error('Error in saveInboxItemToPage:', err)
    return false
  }
}

/**
 * Helper function to save attachments to special orders
 */
async function saveAttachmentsToSpecialOrder(
  specialOrderId: string,
  attachments: AttachmentNode[],
  uploadedBy: AdminRole
): Promise<void> {
  for (const attachment of attachments) {
    const attachmentData = {
      id: attachment.id,
      special_order_id: specialOrderId,
      file_name: attachment.file_name,
      file_url: attachment.file_url,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      uploaded_by: uploadedBy,
      archived: false,
    }

    const { error } = await supabase
      .from('special_order_attachments')
      .insert(attachmentData)

    if (error) {
      console.error('Error saving attachment:', attachment.file_name, error)
    }

    // Recursively save child attachments
    if (attachment.children && attachment.children.length > 0) {
      await saveAttachmentsToSpecialOrder(specialOrderId, attachment.children, uploadedBy)
    }
  }
}