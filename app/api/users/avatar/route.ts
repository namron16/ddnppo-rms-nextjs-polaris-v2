// app/api/users/avatar/route.ts
// Profile avatar upload API.
// POST — upload a profile photo to Drive pool (replaces Supabase avatars bucket)

import { NextResponse } from 'next/server'
import { uploadAvatarViaPool } from '@/lib/gdrive-pool/migrate-modal'

export const runtime = 'nodejs'
export const maxDuration = 30

/** POST /api/users/avatar — upload a profile photo */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file     = formData.get('file')     as File | null
    const username = formData.get('username') as string | null

    if (!file || !username) {
      return NextResponse.json(
        { error: 'Missing required fields: file, username' },
        { status: 400 }
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}. Only images are accepted.` },
        { status: 415 }
      )
    }

    const MAX_BYTES = 5 * 1024 * 1024   // 5 MB avatar limit
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 5 MB limit.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await uploadAvatarViaPool({
      file:          buffer,
      fileName:      file.name,
      mimeType:      file.type,
      username,
      fileSizeBytes: file.size,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err: any) {
    console.error('[Avatar Upload API]', err.message)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}