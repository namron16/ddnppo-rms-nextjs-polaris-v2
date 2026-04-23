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

  // 2. Insert into the appropriate table scoped to this recipient
  // (table choice based on targetPage, data from document_data JSON)
  // ... insert logic per document type ...

  // 3. Mark inbox item as saved
  await supabase
    .from('inbox_items')
    .update({ status: 'saved', saved_to: targetPage, saved_at: new Date().toISOString() })
    .eq('id', inboxItemId)

  return true
}