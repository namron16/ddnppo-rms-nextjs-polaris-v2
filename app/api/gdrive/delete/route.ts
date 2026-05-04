// app/api/gdrive/delete/route.ts
import { NextResponse } from 'next/server'
import { deleteFile } from '@/lib/gdrive-pool/gateway'

export const runtime = 'nodejs'

/** DELETE /api/gdrive/delete — removes file from Drive and Supabase records */
export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const { gdriveFileId, poolAccountId, recordId } = body

    if (!gdriveFileId || !poolAccountId || !recordId) {
      return NextResponse.json(
        { error: 'Missing required fields: gdriveFileId, poolAccountId, recordId' },
        { status: 400 }
      )
    }

    const result = await deleteFile({ gdriveFileId, poolAccountId, recordId })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ data: { success: true } })
  } catch (err: any) {
    console.error('[Delete API]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// =============================================================================
// app/api/gdrive/disconnect/route.ts
// =============================================================================

// FILE: app/api/gdrive/disconnect/route.ts — create this as a separate file
// Contents shown inline here for reference:
//
// import { NextResponse } from 'next/server'
// import { deactivatePoolAccount, logHealthEvent } from '@/lib/gdrive-pool/db'
//
// export const runtime = 'nodejs'
//
// export async function POST(request: Request) {
//   const { poolAccountId } = await request.json()
//   if (!poolAccountId) return NextResponse.json({ error: 'poolAccountId required' }, { status: 400 })
//   const orphanedFiles = await deactivatePoolAccount(poolAccountId)
//   await logHealthEvent({
//     pool_account_id: poolAccountId,
//     event_type: 'disconnect', status: 'warning',
//     message: `Account disconnected. ${orphanedFiles} files now inaccessible.`,
//     latency_ms: null,
//   })
//   return NextResponse.json({ data: { success: true, filesOrphaned: orphanedFiles } })
// }