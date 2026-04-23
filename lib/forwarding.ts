import { InboxItem } from "@/types"
import { logAction } from "./adminLogger"
import { AdminRole } from "./auth"
import { supabase } from "./supabase"

export interface ForwardPayload {
  documentType: 'master' | 'admin_order' | 'daily_journal' | 'library'
  documentId: string
  documentTitle: string
  recipients: AdminRole[]  // one or more of P2–P10
  note?: string
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
 * Builds the full attachment tree from attachmentsMap, recursively.
 * Preserves parent→child nesting so recipients get the complete hierarchy.
 */
export function buildAttachmentTree(
  rootId: string,
  attachmentsMap: Map<string, any[]>
): AttachmentNode[] {
  const directChildren = (attachmentsMap.get(rootId) ?? []).filter(a => !a.archived)
  return directChildren.map(att => ({
    id: att.id,
    file_name: att.file_name,
    file_url: att.file_url,
    file_size: att.file_size,
    file_type: att.file_type,
    children: buildAttachmentTree(att.id, attachmentsMap),
  }))
}

/**
 * P1 forwards a document to one or more recipient accounts.
 * Creates one inbox_item row per recipient.
 * Full document hierarchy (parent + all nested attachments) is serialized into the row.
 */
export async function forwardDocument(
  payload: ForwardPayload,
  documentData: Record<string, any>,
  attachmentsMap: Map<string, any[]>
): Promise<{ success: boolean; count: number }> {
  const attachmentTree = buildAttachmentTree(payload.documentId, attachmentsMap)

  const rows = payload.recipients.map(recipient => ({
    id: `fwd-${Date.now()}-${recipient}-${Math.random().toString(36).slice(2)}`,
    recipient_id: recipient,
    sender_id: 'P1',
    document_type: payload.documentType,
    document_id: payload.documentId,
    document_title: payload.documentTitle,
    document_data: documentData,
    file_url: documentData.fileUrl ?? null,
    attachments: JSON.stringify(attachmentTree),
    status: 'unread',
    forwarded_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('inbox_items').insert(rows)
  if (error) {
    console.error('forwardDocument error:', error.message)
    return { success: false, count: 0 }
  }

  // Log the forward action
  for (const recipient of payload.recipients) {
    await logAction('forward_document', 
      `P1 forwarded "${payload.documentTitle}" to ${recipient}`, 'P1')
  }

  return { success: true, count: rows.length }
}

/**
 * P2–P10 saves an inbox item into one of their document pages.
 * The document is stored under their account in Supabase, linked to their Google Drive.
 */
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
          saved_by: recipientId,
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
          saved_by: recipientId,
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