// app/api/documents/route.ts
// ─────────────────────────────────────────────
// REST API stubs for Master Documents.
// Replace the mock data with real DB queries
// (e.g. Prisma, Supabase, Drizzle) in production.

import { NextResponse } from 'next/server'
import { MASTER_DOCUMENTS } from '@/lib/data'

/** GET /api/documents — list all master documents */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const level  = searchParams.get('level')
  const search = searchParams.get('search')?.toLowerCase()

  let docs = MASTER_DOCUMENTS.flat()

  // Filter by level
  if (level && level !== 'all') {
    docs = docs.filter(d => d.level === level.toUpperCase())
  }

  // Filter by search
  if (search) {
    docs = docs.filter(d => d.title.toLowerCase().includes(search))
  }

  return NextResponse.json({ data: docs, total: docs.length })
}

/** POST /api/documents — create a new document */
export async function POST(request: Request) {
  const body = await request.json()

  // Validate required fields
  if (!body.title || !body.level || !body.date) {
    return NextResponse.json(
      { error: 'Missing required fields: title, level, date' },
      { status: 400 }
    )
  }

  // TODO: Insert into database
  const newDoc = {
    id:    `md-${Date.now()}`,
    title: body.title,
    level: body.level,
    date:  body.date,
    type:  body.type  ?? 'PDF',
    size:  body.size  ?? '0 MB',
    tag:   body.tag   ?? 'COMPLIANCE',
  }

  return NextResponse.json({ data: newDoc }, { status: 201 })
}
