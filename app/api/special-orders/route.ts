// app/api/special-orders/route.ts
// ─────────────────────────────────────────────
// REST API stubs for Special Orders.

import { NextResponse } from 'next/server'
import { SPECIAL_ORDERS } from '@/lib/data'

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

/** POST /api/special-orders */
export async function POST(request: Request) {
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
}
