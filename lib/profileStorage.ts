import { supabase } from './supabase'
import type { AdminRole } from './auth'

export interface StoredProfilePrefs {
  displayName?: string
  avatarUrl?: string
  updated_at?: string
}

const LOCAL_KEY_PREFIX = 'rms_profile_prefs:'

function getLocalKey(role: AdminRole): string {
  return `${LOCAL_KEY_PREFIX}${role}`
}

export function getCachedProfilePrefs(role: AdminRole): StoredProfilePrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(getLocalKey(role))
    if (!raw) return {}
    return JSON.parse(raw) as StoredProfilePrefs
  } catch {
    return {}
  }
}

export function saveCachedProfilePrefs(role: AdminRole, prefs: StoredProfilePrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getLocalKey(role), JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

export function clearCachedProfilePrefs(role: AdminRole): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getLocalKey(role))
  } catch {
    // ignore
  }
}

function normalizePrefs(row: any): StoredProfilePrefs {
  return {
    displayName: row?.display_name ?? undefined,
    avatarUrl: row?.avatar_url ?? undefined,
    updated_at: row?.updated_at ?? undefined,
  }
}

export async function getStoredProfilePrefs(role: AdminRole): Promise<StoredProfilePrefs> {
  const { data, error } = await supabase
    .from('admin_profile_prefs')
    .select('*')
    .eq('role', role)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      console.warn('[profileStorage] Failed to fetch admin_profile_prefs:', error.message)
    }
    return getCachedProfilePrefs(role)
  }

  const prefs = normalizePrefs(data)
  saveCachedProfilePrefs(role, prefs)
  return prefs
}

export async function saveStoredProfilePrefs(
  role: AdminRole,
  prefs: StoredProfilePrefs
): Promise<StoredProfilePrefs | null> {
  const payload = {
    role,
    display_name: prefs.displayName ?? null,
    avatar_url: prefs.avatarUrl ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('admin_profile_prefs')
    .upsert(payload, { onConflict: 'role' })
    .select()
    .single()

  if (error || !data) {
    if (error) {
      console.warn('[profileStorage] Failed to save admin_profile_prefs:', error.message)
    }
    return null
  }

  const normalized = normalizePrefs(data)
  saveCachedProfilePrefs(role, normalized)
  return normalized
}

/**
 * Upload a profile avatar to Supabase Storage (avatars bucket).
 * Uses a STABLE path: avatars/{role}.{ext} so the same URL is reused
 * across devices and sessions — no per-device drift.
 *
 * Falls back to the `documents` bucket if `avatars` doesn't exist yet.
 */
export async function uploadProfileAvatar(
  role: AdminRole,
  file: File
): Promise<string | null> {
  // Determine extension from mime type or filename
  const ext = file.type === 'image/png'
    ? 'png'
    : file.type === 'image/webp'
    ? 'webp'
    : file.type === 'image/gif'
    ? 'gif'
    : 'jpg'

  const stablePath = `${role.toLowerCase()}.${ext}`

  // Try the dedicated avatars bucket first
  const { data: storageData, error: storageError } = await supabase.storage
    .from('avatars')
    .upload(stablePath, file, {
      cacheControl: '3600',
      upsert: true,   // overwrite the existing file → stable URL
      contentType: file.type || 'image/jpeg',
    })

  if (!storageError && storageData) {
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(stablePath)
    // Append a cache-buster so browsers pick up the new image immediately
    return `${urlData.publicUrl}?t=${Date.now()}`
  }

  // avatars bucket may not exist — fall back to documents/avatars/ with stable name
  console.warn('[uploadProfileAvatar] avatars bucket failed, falling back:', storageError?.message)

  const fallbackPath = `avatars/${role.toLowerCase()}.${ext}`
  const { data: fallbackData, error: fallbackError } = await supabase.storage
    .from('documents')
    .upload(fallbackPath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'image/jpeg',
    })

  if (fallbackError || !fallbackData) {
    console.error('[uploadProfileAvatar] fallback also failed:', fallbackError?.message)
    return null
  }

  const { data: fallbackUrl } = supabase.storage
    .from('documents')
    .getPublicUrl(fallbackPath)

  return `${fallbackUrl.publicUrl}?t=${Date.now()}`
}

export function subscribeToProfilePrefs(
  role: AdminRole,
  onChange: (prefs: StoredProfilePrefs) => void
): () => void {
  const channel = supabase
    .channel(`admin_profile_prefs_${role}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'admin_profile_prefs',
        filter: `role=eq.${role}`,
      },
      payload => {
        const prefs = normalizePrefs(payload.new)
        saveCachedProfilePrefs(role, prefs)
        onChange(prefs)
      }
    )
    .subscribe()

  return () => { void supabase.removeChannel(channel) }
}