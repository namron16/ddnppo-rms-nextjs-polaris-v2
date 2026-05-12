// app/api/forward/[id]/save/route.ts
// Routes the forwarded document to the correct Supabase table based on document_type,
// inserts attachments, and marks the forwarded record as saved.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logSaveForwardedDocument, setCurrentLogger } from '@/lib/adminLogger'
import { AdminRole } from '@/lib/auth'

// Maps document_type → Supabase table name
const DOCUMENT_TABLE_MAP: Record<string, string> = {
  master_document: 'master_documents',
  admin_order:     'admin_orders',
  daily_journal:   'daily_journals',
  library:         'library_items',
}

// Maps document_type → attachments table name
const ATTACHMENT_TABLE_MAP: Record<string, string> = {
  master_document: 'master_document_attachments',
  admin_order:     'admin_order_attachments',
  daily_journal:   'daily_journal_attachments',
  library:         'library_item_attachments',
}

// The foreign key column name used in each attachments table
const ATTACHMENT_FK_MAP: Record<string, string> = {
  master_document: 'master_document_id',
  admin_order:     'admin_order_id',
  daily_journal:   'daily_journal_id',
  library:         'library_item_id',
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  setCurrentLogger(profile.role as AdminRole, user.id)
  // 1. Fetch the forwarded document (RLS ensures recipient_role matches)
  const { data: fwd, error: fetchError } = await supabase
    .from('forwarded_documents')
    .select('*, forwarded_attachments(*)')
    .eq('id', params.id)
    .eq('recipient_role', profile.role)
    .single()

  if (fetchError || !fwd) {
    return NextResponse.json({ error: 'Forwarded document not found' }, { status: 404 })
  }

  if (fwd.status !== 'pending') {
    return NextResponse.json(
      { error: `Document already ${fwd.status}` },
      { status: 409 }
    )
  }

  const targetTable     = DOCUMENT_TABLE_MAP[fwd.document_type]
  const attachmentTable = ATTACHMENT_TABLE_MAP[fwd.document_type]
  const attachmentFk    = ATTACHMENT_FK_MAP[fwd.document_type]

  if (!targetTable) {
    return NextResponse.json(
      { error: `Unknown document_type: ${fwd.document_type}` },
      { status: 400 }
    )
  }

  // 2. Insert new document row into the correct table
  const { data: newDoc, error: docError } = await supabase
    .from(targetTable)
    .insert({
      title:           fwd.title,
      gdrive_file_id:  fwd.gdrive_file_id,
      gdrive_url:      fwd.gdrive_url,
      pool_account_id: fwd.pool_account_id,
      file_name:       fwd.file_name,
      file_size_bytes: fwd.file_size_bytes,
      mime_type:       fwd.mime_type,
      source:          'forwarded',
      forwarded_from:  fwd.sender_role,
      uploaded_by:     profile.role,
      // Add any other required fields with defaults here
    })
    .select()
    .single()

  if (docError || !newDoc) {
    return NextResponse.json(
      { error: docError?.message ?? 'Failed to save document' },
      { status: 500 }
    )
  }

  // 3. Insert attachments into the correct attachments table
  const attachments = fwd.forwarded_attachments ?? []
  if (attachments.length > 0) {
    const attRows = attachments.map((att: any) => ({
      [attachmentFk]:  newDoc.id,
      title:           att.title,
      file_name:       att.file_name,
      file_size_bytes: att.file_size_bytes,
      mime_type:       att.mime_type,
      gdrive_file_id:  att.gdrive_file_id,
      gdrive_url:      att.gdrive_url,
      pool_account_id: att.pool_account_id,
      parent_id:       att.parent_attachment_id ?? null,
      depth:           att.depth ?? 0,
    }))

    const { error: attError } = await supabase
      .from(attachmentTable)
      .insert(attRows)

    if (attError) {
      // Log but don't fail — document was saved successfully
      console.error('Attachment save error:', attError)
    }
  }

  // 4. Mark forwarded record as saved
  const { error: updateError } = await supabase
    .from('forwarded_documents')
    .update({
      status:       'saved',
      saved_at:     new Date().toISOString(),
      saved_doc_id: newDoc.id,
    })
    .eq('id', fwd.id)

  if (updateError) {
    console.error('Status update error:', updateError)
  }

  await logSaveForwardedDocument(fwd.title, fwd.sender_role, targetTable)

  return NextResponse.json({
    success:    true,
    savedDocId: newDoc.id,
    table:      targetTable,
  })
}