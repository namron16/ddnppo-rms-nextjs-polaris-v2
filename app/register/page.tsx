'use client'
// app/register/page.tsx

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { AccessRequestSchema, zodErrors } from '@/lib/validations'

type FormState = 'idle' | 'submitting' | 'success' | 'error'
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface LiveUpdate {
  type: 'connected' | 'reviewed'
  status?: ReviewStatus
  rejectionReason?: string
  reviewedAt?: string
}

const STORAGE_KEY = 'ddnppo_register_pending'

export default function RegisterPage() {
  const [formState, setFormState]       = useState<FormState>('idle')
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [form, setForm]                 = useState({ fullName: '', email: '', contactNo: '' })
  const [submittedId, setSubmittedId]   = useState<string | null>(null)
  const [liveUpdate, setLiveUpdate]     = useState<LiveUpdate | null>(null)
  const [realtimeActive, setRealtimeActive] = useState(false)
  const [restoring, setRestoring]       = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Restore state from localStorage on mount ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') {
      setRestoring(false)
      return
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setRestoring(false)
      return
    }

    let parsed: { id: string; fullName: string; email: string; contactNo: string } | null = null
    try {
      parsed = JSON.parse(stored)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      setRestoring(false)
      return
    }

    if (!parsed?.id) {
      localStorage.removeItem(STORAGE_KEY)
      setRestoring(false)
      return
    }

    // Fetch the latest status from Supabase
    supabase
      .from('access_requests')
      .select('status, full_name, rejection_reason, reviewed_at')
      .eq('id', parsed.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          // Row doesn't exist — clear and show form
          localStorage.removeItem(STORAGE_KEY)
          setRestoring(false)
          return
        }

        const status = data.status as ReviewStatus

        if (status === 'APPROVED' || status === 'REJECTED') {
          // Already reviewed — show result then clear storage
          localStorage.removeItem(STORAGE_KEY)
          setForm({
            fullName:  data.full_name ?? parsed!.fullName,
            email:     parsed!.email,
            contactNo: parsed!.contactNo,
          })
          setSubmittedId(parsed!.id)
          setFormState('success')
          setLiveUpdate({
            type:            'reviewed',
            status:          status,
            rejectionReason: data.rejection_reason ?? undefined,
            reviewedAt:      data.reviewed_at      ?? undefined,
          })
        } else {
          // Still pending — restore the waiting screen
          setForm({
            fullName:  data.full_name ?? parsed!.fullName,
            email:     parsed!.email,
            contactNo: parsed!.contactNo,
          })
          setSubmittedId(parsed!.id)
          setFormState('success')
        }

        setRestoring(false)
      })
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!submittedId) return

    // Don't subscribe if already showing a reviewed result
    if (liveUpdate?.type === 'reviewed') return

    const channel = supabase
      .channel(`register_request_${submittedId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'access_requests',
          filter: `id=eq.${submittedId}`,
        },
        (payload) => {
          const updated = payload.new as {
            status: ReviewStatus
            rejection_reason?: string
            reviewed_at?: string
          }

          if (updated.status === 'APPROVED' || updated.status === 'REJECTED') {
            // Clear localStorage — no longer pending
            localStorage.removeItem(STORAGE_KEY)

            setLiveUpdate({
              type:            'reviewed',
              status:          updated.status,
              rejectionReason: updated.rejection_reason ?? undefined,
              reviewedAt:      updated.reviewed_at      ?? undefined,
            })
          }
        }
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setRealtimeActive(false)
    }
  }, [submittedId, liveUpdate?.type])

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [k]: e.target.value }))
    setErrors(p => ({ ...p, [k]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const result = AccessRequestSchema.safeParse(form)
    if (!result.success) {
      setErrors(zodErrors(result.error))
      return
    }
    setErrors({})
    setFormState('submitting')

    try {
      const newId = `req-${Date.now()}`
      const { error } = await supabase.from('access_requests').insert({
        id:           newId,
        full_name:    result.data.fullName.trim(),
        email:        result.data.email.trim().toLowerCase(),
        contact_no:   result.data.contactNo.trim(),
        status:       'PENDING',
        submitted_at: new Date().toISOString(),
      })
      if (error) throw error

      // Persist to localStorage so refresh restores the pending screen
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          id:        newId,
          fullName:  result.data.fullName.trim(),
          email:     result.data.email.trim().toLowerCase(),
          contactNo: result.data.contactNo.trim(),
        })
      )

      setSubmittedId(newId)
      setFormState('success')
    } catch {
      setFormState('error')
    }
  }

  function handleTryAgain() {
    localStorage.removeItem(STORAGE_KEY)
    setFormState('idle')
    setLiveUpdate(null)
    setSubmittedId(null)
    setErrors({})
    setForm({ fullName: '', email: '', contactNo: '' })
  }

  const cls = (f: string) =>
    `w-full px-4 py-3 border-[1.5px] rounded-xl text-sm bg-slate-50 focus:outline-none focus:bg-white transition ${
      errors[f]
        ? 'border-red-400 focus:border-red-400'
        : 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
    }`

  // ── Loading while restoring ───────────────────────────────────────────────
  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Checking your request status…</p>
        </div>
      </div>
    )
  }

  // ── Reviewed result screen ────────────────────────────────────────────────
  if (formState === 'success' && liveUpdate?.type === 'reviewed') {
    const approved = liveUpdate.status === 'APPROVED'
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 ${
              approved ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              {approved ? '🎉' : '🚫'}
            </div>

            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              {approved ? 'Access Approved!' : 'Request Rejected'}
            </h1>

            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              {approved
                ? 'Your access request has been approved by an administrator. You can now sign in to the system.'
                : 'Your access request was not approved at this time.'}
            </p>

            {!approved && liveUpdate.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-left">
                <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-1">Reason</p>
                <p className="text-sm text-red-700">{liveUpdate.rejectionReason}</p>
              </div>
            )}

            {liveUpdate.reviewedAt && (
              <p className="text-xs text-slate-400 mb-5">
                Reviewed on{' '}
                {new Date(liveUpdate.reviewedAt).toLocaleString('en-PH', {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}

            <div className="flex gap-3 justify-center">
              {approved ? (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-blue-700 transition"
                >
                  → Sign In Now
                </Link>
              ) : (
                <button
                  onClick={handleTryAgain}
                  className="inline-flex items-center gap-2 bg-slate-600 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-slate-700 transition"
                >
                  ← Submit New Request
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Pending / waiting screen ──────────────────────────────────────────────
  if (formState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
              ✅
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Request Submitted!</h1>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Your access request is now{' '}
              <strong className="text-amber-600">pending review</strong> by an administrator.
            </p>

            {/* Live status indicator */}
            <div className={`flex items-center justify-center gap-2 mb-5 px-4 py-2.5 rounded-full text-xs font-semibold border transition-all ${
              realtimeActive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              {realtimeActive ? (
                <>
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Live — this page updates instantly when reviewed
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-slate-300 rounded-full" />
                  Connecting to live updates…
                </>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 text-left">
              <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-300">
                ⏳ Pending Approval
              </span>
              <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                Typical review time is 1–2 business days. This page will update automatically once reviewed.
                <span className="block font-semibold mt-1">
                  You can safely close and reopen this page — your status will be restored.
                </span>
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6 text-left space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">What you submitted</p>
              <p className="text-sm text-slate-700"><span className="font-semibold">Name:</span> {form.fullName}</p>
              <p className="text-sm text-slate-700"><span className="font-semibold">Email:</span> {form.email}</p>
              <p className="text-sm text-slate-700"><span className="font-semibold">Contact:</span> {form.contactNo}</p>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-blue-700 transition"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Registration form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Branding panel */}
      <div className="flex-1 login-gradient p-16 flex-col justify-center relative overflow-hidden hidden lg:flex">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full border-[80px] border-white/[0.04]" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full border-[60px] border-white/[0.04]" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-9">
            <div className="w-2 h-2 bg-yellow-400 rounded-full" />
            <span className="text-white text-xs font-semibold tracking-wide">DDNPPO Records Management System</span>
          </div>
          <h1 className="font-display text-4xl text-white leading-tight mb-4">Request Access</h1>
          <p className="text-white/60 text-[15px] leading-relaxed mb-8 max-w-sm">
            Submit your information to request access. An administrator will review your request.
          </p>
          <ul className="space-y-3">
            {[
              'Secure document management',
              'Role-based access control',
              'Full audit trail',
              'Confidential document access',
            ].map(f => (
              <li key={f} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-start gap-3 bg-white/10 border border-white/20 rounded-xl px-4 py-3">
            <span className="text-emerald-400 text-lg flex-shrink-0">⚡</span>
            <div>
              <p className="text-white text-xs font-semibold mb-0.5">Live Status Updates</p>
              <p className="text-white/60 text-xs leading-relaxed">
                After submitting, this page will automatically update the moment an admin reviews your request.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="w-full lg:w-[480px] bg-white px-8 lg:px-14 py-12 flex flex-col justify-center">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-yellow-400 rounded-lg flex items-center justify-center">🛡️</div>
            <span className="text-sm font-bold text-slate-800">DDNPPO Records System</span>
          </div>

          <h2 className="font-display text-3xl text-slate-800 mb-1">Create Request</h2>
          <p className="text-slate-500 text-sm mb-8">Fill in your details to request system access.</p>

          {formState === 'error' && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">❌</span>
              <span>Something went wrong. Please try again or contact your administrator.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={cls('fullName')}
                placeholder="e.g. Ana Marie Santos"
                value={form.fullName}
                onChange={field('fullName')}
                disabled={formState === 'submitting'}
              />
              {errors.fullName && <p className="text-xs text-red-500 mt-1.5 font-medium">⚠ {errors.fullName}</p>}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className={cls('email')}
                placeholder="yourname@ddnppo.gov.ph"
                value={form.email}
                onChange={field('email')}
                disabled={formState === 'submitting'}
              />
              {errors.email && <p className="text-xs text-red-500 mt-1.5 font-medium">⚠ {errors.email}</p>}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                className={cls('contactNo')}
                placeholder="e.g. 09171234567"
                value={form.contactNo}
                onChange={field('contactNo')}
                disabled={formState === 'submitting'}
              />
              {errors.contactNo && <p className="text-xs text-red-500 mt-1.5 font-medium">⚠ {errors.contactNo}</p>}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">ℹ️</span>
              <span>Your request will be reviewed by an administrator. You will not gain access until approved.</span>
            </div>

            <button
              type="submit"
              disabled={formState === 'submitting'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-[15px] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {formState === 'submitting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : '📨 Submit Request'}
            </button>
          </form>

          <p className="text-center mt-5 text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}