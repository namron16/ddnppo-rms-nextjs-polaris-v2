'use client'
// app/login/page.tsx — Admin-Only Login (No public registration)

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth, ADMIN_ACCOUNTS } from '@/lib/auth'

const ROLE_OPTIONS = ADMIN_ACCOUNTS.map(a => ({
  id: a.id,
  label: `${a.id} — ${a.title}`,
}))

export default function LoginPage() {
  const { login } = useAuth()
  const router    = useRouter()

  const [roleId, setRoleId]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!roleId) { setError('Please select your role.'); return }
    if (!password) { setError('Please enter your password.'); return }

    setLoading(true)
    const success = login(roleId, password)
    setLoading(false)

    if (!success) {
      setError('Invalid credentials. Please check your role and password.')
      return
    }

    router.push('/admin/master')
  }

  // Common input styling matching the design
  const inputBaseClass = `w-full px-4 py-3 border rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#1b365d]/50 transition`
  const inputClass = error 
    ? `${inputBaseClass} border-red-300` 
    : `${inputBaseClass} border-slate-300`

  return (
    <div className="min-h-screen flex font-sans">

      {/* ── Left: Branding & Background ── */}
      <div 
        className="flex-1 relative overflow-hidden flex flex-col justify-center px-16 bg-cover bg-center"
        style={{ backgroundColor: '#2e4769' }}
      >
        <Image
          src="/assets/pnp-bg.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#2e4769]/75 mix-blend-overlay" />

        {/* DNPPO Top-Left Badge */}
        <div className="inline-flex w-fit mb-6 items-center gap-3 border-[3px] border-[#fde047] rounded-full pl-2 pr-6 py-1.5 bg-[#1b365d]/80 backdrop-blur-sm shadow-xl">
          {/* Replace with your actual DNPPO logo */}
          <Image
            src="/assets/dnppo-logo.png"
            alt="DNPPO Logo"
            width={48}
            height={48}
            priority
            sizes="48px"
            className="w-12 h-12 rounded-full bg-white object-contain"
          />
          <span className="text-[#fde047] font-serif text-lg leading-tight font-medium tracking-wide">
            Davao Norte Police Provincial Office
          </span>
        </div>

        {/* Main Headings */}
        <div
          className="relative z-10 max-w-2xl"
          style={{ textShadow: '5px 2px 5px rgba(0, 0, 0, 0.8)' }}
        >
          <h1 className="font-serif text-[4rem] text-[#fde047] leading-[1.1] mb-6 drop-shadow-lg font-bold ">
            Records Management<br />System
          </h1>
          <p className="text-[#fde047] text-lg leading-snug max-w-lg drop-shadow-md font-medium">
            Secure, centralized document management for Davao Norte Provincial Police Office personnel
          </p>
        </div>

        {/* Faded Large PNP Logo Overlay */}
        <div className="absolute top-10 right-10 transform pointer-events-none ">
          {/* Replace with your actual PNP logo */}
          <Image
            src="/assets/pnp-logo.png"
            alt="PNP Background"
            width={250}
            height={250}
            sizes="300px"
            className="w-[150px] h-auto drop-shadow-2xl"
          />
        </div>
      </div>

      {/* ── Right: Login Form ── */}
      <div className="w-[500px] bg-white px-12 py-10 flex flex-col relative shadow-2xl z-20">
        
        <div className="flex-1 flex flex-col justify-center items-center w-full">
          {/* Top Centered Logo */}
          <Image
            src="/assets/police-regional-logo.png"
            alt="PNP Logo"
            width={64}
            height={64}
            priority
            sizes="64px"
            className="w-16 h-16 mb-4 object-contain"
          />
          
          <div className="text-center mb-10 w-full">
            <h2 className="font-serif text-[2.5rem] text-[#1b365d] font-bold mb-2 flex items-center justify-center gap-3">
              <span className="text-[#fde047] text-2xl">⭐</span>
              Sign In
              <span className="text-[#fde047] text-2xl">⭐</span>
            </h2>
            <p className="text-slate-800 text-sm font-medium">
              Access restricted to authorized DNPPO personnel
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="w-full space-y-6">

            {/* Role selector */}
            <div className="w-full">
              <label className="block text-[#1b365d] font-bold text-base mb-2">
                Role
              </label>
              <select
                value={roleId}
                onChange={e => { setRoleId(e.target.value); setError('') }}
                className={inputClass}
                disabled={loading}
              >
                <option value="" disabled>select your admin role</option>
                {ROLE_OPTIONS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div className="w-full">
              <label className="block text-[#1b365d] font-bold text-base mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Enter Password"
                className={inputClass}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1b365d] hover:bg-[#152a4a] text-[#fde047] font-semibold py-3.5 rounded-lg transition text-lg disabled:opacity-70 mt-2 shadow-md"
            >
              {loading ? 'Signing in...' : 'SIGN IN'}
            </button>
          </form>

          <div className="text-center mt-8 text-[11px] text-slate-400 leading-relaxed font-medium">
            <p>Access credentials are issued by your system administrator</p>
            <p>No public registration available.</p>
          </div>

          {/* Dev helper — remove in production */}
          <details className="mt-8 w-full text-center">
            <summary className="text-[10px] text-slate-300 cursor-pointer hover:text-slate-400 outline-none">
              Dev credentials (remove in production)
            </summary>
            <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-500 space-y-1 text-left inline-block">
              <p><strong>PD</strong>: pd@ddnppo2024</p>
              <p><strong>DPDA</strong>: dpda@ddnppo2024</p>
              <p><strong>DPDO</strong>: dpdo@ddnppo2024</p>
              <p><strong>P1</strong>: p1@ddnppo2024</p>
              <p><strong>P2–P10</strong>: p2@ddnppo2024 … p10@ddnppo2024</p>
            </div>
          </details>
        </div>

        {/* STI Footer */}
        <div className="mt-auto pt-6 flex items-center justify-center gap-3 w-full border-t border-slate-100">
          <p className="text-[10px] text-slate-700 font-medium leading-tight text-center max-w-[250px]">
            This Record Management System was developed in collaboration with the 4th-year BSIS students, Class 2026 of STI College Tagum.
          </p>
          {/* Replace with your actual STI logo */}
          <Image
            src="/assets/sti-tagum-logo.png"
            alt="STI Logo"
            width={35}
            height={35}
            sizes="35px"
            className="h-auto w-auto object-contain"
          />
        </div>

          <p className="text-[10px] text-slate-700/20 font-medium  text-center my-5 translate-y-12">
            Steven Prudente
          </p>  

      </div>
    </div>
  )
}