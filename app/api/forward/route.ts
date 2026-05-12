// app/api/forward/route.ts
// Creates forwarded_documents + forwarded_attachments rows for each recipient.
// No GDrive uploads — only metadata.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logForwardDocument, setCurrentLogger } from '@/lib/adminLogger'
import { AdminRole } from '@/lib/auth'




export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  setCurrentLogger(profile.role as AdminRole, user.id)

  const body = await req.json()
  const {
    recipients,       // string[] — e.g. ['P2', 'P3']
    originalDocId,    // uuid
    documentType,     // 'master_document' | 'admin_order' | 'daily_journal' | 'library'
    title,
    notes,
    gdriveFileId,
    gdriveUrl,
    poolAccountId,
    fileName,
    fileSizeBytes,
    mimeType,
    attachments,      // Array of attachment objects (see type below)
  } = body

  if (!recipients?.length) {
    return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })
  }

  const results: { recipient: string; id: string }[] = []
  const errors:  { recipient: string; error: string }[] = []

  for (const recipientRole of recipients) {
    try {
      // 1. Insert forwarded_documents row
      const { data: fwdDoc, error: insertError } = await supabase
        .from('forwarded_documents')
        .insert({
          sender_role:     profile.role,
          recipient_role:  recipientRole,
          original_doc_id: originalDocId,
          document_type:   documentType,
          title,
          notes:           notes ?? null,
          gdrive_file_id:  gdriveFileId,
          gdrive_url:      gdriveUrl,
          pool_account_id: poolAccountId,
          file_name:       fileName ?? null,
          file_size_bytes: fileSizeBytes ?? null,
          mime_type:       mimeType ?? null,
          status:          'pending',
        })
        .select()
        .single()

      if (insertError || !fwdDoc) {
        errors.push({ recipient: recipientRole, error: insertError?.message ?? 'Insert failed' })
        continue
      }

      // 2. Insert forwarded_attachments rows (if any)
      if (attachments?.length) {
        const attachmentRows = attachments.map((att: any) => ({
          forwarded_document_id:  fwdDoc.id,
          original_attachment_id: att.originalAttachmentId ?? null,
          parent_attachment_id:   att.parentAttachmentId ?? null,
          depth:                  att.depth ?? 0,
          title:                  att.title,
          file_name:              att.fileName ?? null,
          file_size_bytes:        att.fileSizeBytes ?? null,
          mime_type:              att.mimeType ?? null,
          gdrive_file_id:         att.gdriveFileId,
          gdrive_url:             att.gdriveUrl,
          pool_account_id:        att.poolAccountId,
        }))

        const { error: attError } = await supabase
          .from('forwarded_attachments')
          .insert(attachmentRows)

        if (attError) {
          console.error(`Attachments insert error for ${recipientRole}:`, attError)
          // Non-fatal: document was forwarded, attachments failed
        }
      }
      await logForwardDocument(title, recipientRole)
      results.push({ recipient: recipientRole, id: fwdDoc.id })
    } catch (err: any) {
      errors.push({ recipient: recipientRole, error: err?.message ?? 'Unknown error' })
    }
  }



  return NextResponse.json({
    success: results.length > 0,
    count:   results.length,
    results,
    errors,
  }, { status: results.length > 0 ? 201 : 500 })
}