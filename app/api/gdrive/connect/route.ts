// =============================================================================
// app/api/gdrive/connect/route.ts
// Step 1 of OAuth2 flow: redirect user to Google consent screen
// =============================================================================

// FILE: app/api/gdrive/connect/route.ts
import { NextResponse } from 'next/server'
import { getAuthorizationUrl } from '@/lib/gdrive-pool/drive-client'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')

  if (!username) {
    return NextResponse.json({ error: 'username query param is required' }, { status: 400 })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gdrive/callback`
  const authUrl     = getAuthorizationUrl(username, redirectUri)

  return NextResponse.redirect(authUrl)
}