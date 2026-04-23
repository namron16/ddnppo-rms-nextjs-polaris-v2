'use client'

import { useEffect, useState } from 'react'

interface LogoutConfirmModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function LogoutConfirmModal({ open, onConfirm, onCancel }: LogoutConfirmModalProps) {
  const [isMounted, setIsMounted] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      setIsClosing(false)
      return
    }

    if (!isMounted) return

    setIsClosing(true)
    const timeoutId = setTimeout(() => {
      setIsMounted(false)
      setIsClosing(false)
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [open, isMounted])

  if (!isMounted) return null

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[1100] ${isClosing ? 'animate-overlay-soft-out' : 'animate-overlay-soft'}`}
        onClick={onCancel}
      />

      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1200] bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] overflow-hidden ${isClosing ? 'animate-modal-soft-out' : 'animate-modal-soft'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center px-6 pt-8 pb-4">
          <div className="w-16 h-16 rounded-full bg-red-50 border-4 border-red-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Log Out?</h3>
          <p className="text-sm text-slate-500 text-center leading-relaxed">
            Are you sure you want to log out of your account? Your session will be ended.
          </p>
        </div>

        <div className="h-px bg-slate-100 mx-6" />

        <div className="flex gap-3 px-6 py-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border-[1.5px] border-slate-200 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="group flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all duration-200 ease-out flex items-center justify-center gap-2 transform-gpu hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 ease-out group-hover:translate-x-[1px]">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      </div>
    </>
  )
}

export default LogoutConfirmModal