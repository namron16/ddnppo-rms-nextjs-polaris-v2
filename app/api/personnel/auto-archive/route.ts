import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function isSeparatedAndExpired(dateOfSeparation?: string | null): boolean {
  if (!dateOfSeparation) return false
  const separated = new Date(dateOfSeparation)
  const threshold = new Date(separated)
  threshold.setFullYear(threshold.getFullYear() + 15)
  return new Date() >= threshold
}

/**
 * POST /api/personnel/auto-archive
 * Scans separated personnel records and persists Archived status for records
 * older than 15 years. Intended for manual triggering or scheduled cron use.
 */
export async function POST() {
  const { data, error } = await supabase
    .from('personnel_201')
    .select('id,status,date_of_separation')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expiredIds = (data ?? [])
    .filter((record: any) => record.status === 'Separated from Service' && isSeparatedAndExpired(record.date_of_separation))
    .map((record: any) => record.id)

  if (expiredIds.length === 0) {
    return NextResponse.json({ updated: 0, archivedIds: [] })
  }

  const today = new Date().toISOString().split('T')[0]
  const { error: updateError } = await supabase
    .from('personnel_201')
    .update({ status: 'Archived', last_updated: today })
    .in('id', expiredIds)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ updated: expiredIds.length, archivedIds: expiredIds })
}
