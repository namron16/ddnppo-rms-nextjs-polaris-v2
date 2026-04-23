'use client'
// lib/auth.tsx  — Admin-Only RBAC Authentication with Presence + Audit Logging
// 13 hardcoded admin accounts, no public registration

import React, {
  createContext, useContext, useState,
  useCallback, useEffect,
} from 'react'
import { setAdminActive, setAdminInactive } from './accessRequests'
import { logLogin, logLogout, setCurrentLogger } from './adminLogger'
import { getStoredProfilePrefs } from './profileStorage'
import { subscribeToProfilePrefs } from './profileStorage'

// ── Role Definitions ──────────────────────────
export type AdminRole =
  | 'PD' | 'DPDA' | 'DPDO' | 'P1'
  | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'
  | 'P7' | 'P8' | 'P9' | 'P10'

export type RoleLevel = 'head' | 'deputy' | 'super_admin' | 'viewer'

export interface AdminUser {
  id: AdminRole
  role: AdminRole
  name: string
  title: string
  level: RoleLevel
  initials: string
  avatarColor: string
  avatarUrl?: string
  permissions: {
    canUpload: boolean
    canApproveReview: boolean
    canApproveFinal: boolean
    canManageUsers: boolean
    canManageVisibility: boolean
    canViewAll: boolean
  }
}

// ── 13 Hardcoded Admin Accounts ───────────────
export const ADMIN_ACCOUNTS: AdminUser[] = [
  {
    id: 'PD', role: 'PD',
    name: 'Provincial Director', title: 'Provincial Director',
    level: 'head', initials: 'PD', avatarColor: '#dc2626',
    permissions: { canUpload: false, canApproveReview: true, canApproveFinal: true, canManageUsers: true, canManageVisibility: true, canViewAll: true },
  },
  {
    id: 'DPDA', role: 'DPDA',
    name: 'Deputy Director for Administration', title: 'DPDA',
    level: 'deputy', initials: 'DA', avatarColor: '#d97706',
    permissions: { canUpload: false, canApproveReview: true, canApproveFinal: false, canManageUsers: false, canManageVisibility: false, canViewAll: true },
  },
  {
    id: 'DPDO', role: 'DPDO',
    name: 'Deputy Director for Operations', title: 'DPDO',
    level: 'deputy', initials: 'DO', avatarColor: '#b45309',
    permissions: { canUpload: false, canApproveReview: true, canApproveFinal: false, canManageUsers: false, canManageVisibility: false, canViewAll: true },
  },
  {
    id: 'P1', role: 'P1',
    name: 'Records Officer — P1', title: 'Super Admin / Records Officer',
    level: 'super_admin', initials: 'P1', avatarColor: '#7c3aed',
    permissions: { canUpload: true, canApproveReview: false, canApproveFinal: false, canManageUsers: true, canManageVisibility: true, canViewAll: true },
  },
  ...(['P2','P3','P4','P5','P6','P7','P8','P9','P10'] as AdminRole[]).map((role, i) => ({
    id: role, role,
    name: `Admin Officer — ${role}`, title: `Admin Officer ${role}`,
    level: 'viewer' as RoleLevel,
    initials: role, avatarColor: ['#0891b2','#0d9488','#16a34a','#ca8a04','#ea580c','#e11d48','#8b5cf6','#06b6d4','#10b981'][i],
    permissions: { canUpload: false, canApproveReview: false, canApproveFinal: false, canManageUsers: false, canManageVisibility: false, canViewAll: false },
  })),
]

// Password map
const PASSWORDS: Record<AdminRole, string> = {
  PD: 'pd@ddnppo2024', DPDA: 'dpda@ddnppo2024', DPDO: 'dpdo@ddnppo2024',
  P1: 'p1@ddnppo2024', P2: 'p2@ddnppo2024', P3: 'p3@ddnppo2024',
  P4: 'p4@ddnppo2024', P5: 'p5@ddnppo2024', P6: 'p6@ddnppo2024',
  P7: 'p7@ddnppo2024', P8: 'p8@ddnppo2024', P9: 'p9@ddnppo2024',
  P10: 'p10@ddnppo2024',
}

// ── RBAC Helpers ──────────────────────────────
export function canUserViewDocument(user: AdminUser, visibleToRoles: AdminRole[]): boolean {
  if (user.permissions.canViewAll) return true
  return visibleToRoles.includes(user.role)
}
export function isReviewer(role: AdminRole) { return role === 'DPDA' || role === 'DPDO' }
export function isFinalApprover(role: AdminRole) { return role === 'PD' }

// ── Auth Context ──────────────────────────────
interface AuthContextValue {
  user: AdminUser | null
  login: (roleId: string, password: string) => boolean
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function setCookie(name: string, value: string, days = 1) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}
function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isLoading, setLoading] = useState(true)

  async function applyStoredProfilePrefs(account: AdminUser): Promise<AdminUser> {
    const prefs = await getStoredProfilePrefs(account.role)
    return {
      ...account,
      name: prefs.displayName ?? account.name,
      avatarUrl: prefs.avatarUrl ?? account.avatarUrl,
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const roleId = getCookie('rms_session')
      if (roleId) {
        const found = ADMIN_ACCOUNTS.find(a => a.id === roleId)
        if (found) {
          const nextUser = await applyStoredProfilePrefs(found)
          if (!active) return
          setUser(nextUser)
          setCurrentLogger(found.id)
          setAdminActive(found.id).catch(() => {})
        } else {
          deleteCookie('rms_session')
          deleteCookie('rms_role')
        }
      }

      if (active) setLoading(false)
    })()

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return

    return subscribeToProfilePrefs(user.role, prefs => {
      setUser(prev => {
        if (!prev || prev.role !== user.role) return prev
        return {
          ...prev,
          name: prefs.displayName ?? prev.name,
          avatarUrl: prefs.avatarUrl ?? prev.avatarUrl,
        }
      })
    })
  }, [user?.role])

  useEffect(() => {
    if (!user) return

    const refreshFromStore = async () => {
      const prefs = await getStoredProfilePrefs(user.role)
      setUser(prev => {
        if (!prev || prev.role !== user.role) return prev
        const nextName = prefs.displayName ?? prev.name
        const nextAvatar = prefs.avatarUrl ?? prev.avatarUrl
        if (nextName === prev.name && nextAvatar === prev.avatarUrl) return prev
        return {
          ...prev,
          name: nextName,
          avatarUrl: nextAvatar,
        }
      })
    }

    const intervalId = window.setInterval(() => {
      void refreshFromStore()
    }, 15000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromStore()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user?.role])

  // Mark inactive when tab/window closes. Do not log logout here because
  // browser refresh also triggers unload and would create false logout logs.
  useEffect(() => {
    if (!user) return
    const handleUnload = () => {
      setAdminInactive(user.id).catch(() => {})
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [user])

  const login = useCallback((roleId: string, password: string): boolean => {
    const account = ADMIN_ACCOUNTS.find(a => a.id === roleId.toUpperCase())
    if (!account) return false
    const expected = PASSWORDS[account.role]
    if (password !== expected) return false
    void applyStoredProfilePrefs(account).then(setUser)
    setCookie('rms_session', account.id)
    setCookie('rms_role', account.role)
    setCurrentLogger(account.id)
    setAdminActive(account.id).catch(() => {})
    logLogin(account.id)
    return true
  }, [])

  const logout = useCallback(() => {
    if (user) {
      logLogout(user.id)
      setAdminInactive(user.id).catch(() => {})
    }
    setCurrentLogger(null)
    deleteCookie('rms_session')
    deleteCookie('rms_role')
    setTimeout(() => setUser(null), 50)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function isAdminRole(user: AdminUser | null): boolean {
  return user !== null
}