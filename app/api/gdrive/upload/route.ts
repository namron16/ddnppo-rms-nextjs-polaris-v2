// app/api/gdrive/upload/route.ts
import { NextResponse } from 'next/server'
import { uploadViaPool } from '@/lib/gdrive-pool/migrate-modal'
import type { DocumentCategory } from '@/lib/gdrive-pool/types'

export const runtime = 'nodejs'
export const maxDuration = 60   // seconds (file uploads can be slow)

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file            = formData.get('file')       as File | null
    const category        = formData.get('category')   as DocumentCategory | null
    const entityType      = formData.get('entityType') as string | null
    const entityId        = formData.get('entityId')   as string | null
    const uploadedBy      = formData.get('uploadedBy') as string | null
    const preferredPoolId = formData.get('preferredPoolId') as string | null

    if (!file || !category || !uploadedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: file, category, uploadedBy' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}. Only PDF and images are accepted.` },
        { status: 415 }
      )
    }

    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await uploadViaPool({
      file:          buffer,
      fileName:      file.name,
      mimeType:      file.type,
      category,
      entityType:    entityType    ?? undefined,
      entityId:      entityId      ?? undefined,
      uploadedBy,
      fileSizeBytes: file.size,
      preferredPoolId: preferredPoolId ?? undefined,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err: any) {
    console.error('[Upload API]', err.message)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}