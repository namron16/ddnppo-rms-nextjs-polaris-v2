// app/api/personnel/documents/route.ts
// Personnel 201 document upload API.
// POST — upload a 201 file to Drive pool and return Drive metadata

import { NextResponse } from 'next/server'
import { upload201Document } from '@/lib/gdrive-pool/migrate-modal'

export const runtime = 'nodejs'
export const maxDuration = 60

/** POST /api/personnel/documents — upload a 201 file to the Drive pool */
export async function POST(request: Request) {
  try {
    const formData   = await request.formData()
    const file       = formData.get('file')       as File | null
    const docId      = formData.get('docId')      as string | null
    const uploadedBy = formData.get('uploadedBy') as string | null

    if (!file || !docId || !uploadedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: file, docId, uploadedBy' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}. Only PDF and images are accepted.` },
        { status: 415 }
      )
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await upload201Document({
      file:          buffer,
      fileName:      file.name,
      mimeType:      file.type,
      docId,
      uploadedBy,
      fileSizeBytes: file.size,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err: any) {
    console.error('[Personnel Documents API POST]', err.message)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}