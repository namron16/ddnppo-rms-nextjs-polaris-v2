// app/api/forward/inbox/count/route.ts
// Lightweight endpoint just for the sidebar badge.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ count: 0 })

  const { count } = await supabase
    .from('forwarded_documents')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_role', profile.role)
    .eq('status', 'pending')

  return NextResponse.json({ count: count ?? 0 })
}