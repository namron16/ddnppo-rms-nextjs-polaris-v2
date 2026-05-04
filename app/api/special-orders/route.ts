// app/api/special-orders/route.ts
// Special Orders REST API.
// GET  — list / filter orders (from DB)
// POST — create a new special order + upload attachment to Drive pool

import { NextResponse } from 'next/server'
import { SPECIAL_ORDERS } from '@/lib/data'
import { uploadSpecialOrder } from '@/lib/gdrive-pool/migrate-modal'

/** GET /api/special-orders */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const year   = searchParams.get('year')

  let orders = [...SPECIAL_ORDERS]

  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status.toUpperCase())
  }
  if (year && year !== 'all') {
    orders = orders.filter(o => o.date.startsWith(year))
  }

  return NextResponse.json({ data: orders, total: orders.length })
}

/** POST /api/special-orders — create + upload to Drive */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    // ── Multipart upload (file + metadata) ────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData   = await request.formData()
      const file       = formData.get('file')       as File | null
      const reference  = formData.get('reference')  as string | null
      const subject    = formData.get('subject')    as string | null
      const date       = formData.get('date')       as string | null
      const uploadedBy = formData.get('uploadedBy') as string | null

      if (!reference || !subject || !date) {
        return NextResponse.json(
          { error: 'Missing required fields: reference, subject, date' },
          { status: 400 }
        )
      }

      const soId = `so-${Date.now()}`

      const newOrder: Record<string, any> = {
        id:          soId,
        reference,
        subject,
        date,
        attachments: 0,
        status:      'ACTIVE',
      }

      if (file && uploadedBy) {
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
          return NextResponse.json(
            { error: `File type not allowed: ${file.type}` },
            { status: 415 }
          )
        }

        if (file.size > 50 * 1024 * 1024) {
          return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 413 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        const driveResult = await uploadSpecialOrder({
          file:          buffer,
          fileName:      file.name,
          mimeType:      file.type,
          soId,
          uploadedBy,
          fileSizeBytes: file.size,
        })

        newOrder.fileUrl       = driveResult.fileUrl
        newOrder.downloadUrl   = driveResult.downloadUrl
        newOrder.previewUrl    = driveResult.previewUrl
        newOrder.gdriveFileId  = driveResult.gdriveFileId
        newOrder.poolAccountId = driveResult.poolAccountId
        newOrder.recordId      = driveResult.recordId
        newOrder.attachments   = 1
      }

      return NextResponse.json({ data: newOrder }, { status: 201 })
    }

    // ── JSON body (metadata only) ──────────────────────────────────────────
    const body = await request.json()

    if (!body.reference || !body.subject || !body.date) {
      return NextResponse.json(
        { error: 'Missing required fields: reference, subject, date' },
        { status: 400 }
      )
    }

    const newOrder = {
      id:          `so-${Date.now()}`,
      reference:   body.reference,
      subject:     body.subject,
      date:        body.date,
      attachments: 0,
      status:      'ACTIVE' as const,
    }

    return NextResponse.json({ data: newOrder }, { status: 201 })
  } catch (err: any) {
    console.error('[Special Orders API POST]', err.message)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}