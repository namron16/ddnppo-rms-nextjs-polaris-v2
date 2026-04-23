'use client'
// components/modals/AddSpecialOrderModal.tsx

import { useRef, useState } from 'react'
import { Modal }    from '@/components/ui/Modal'
import { Button }   from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { AddSpecialOrderSchema, zodErrors } from '@/lib/validations'
import type { SpecialOrder } from '@/types'
import { FileText, Image as ImageIcon, Paperclip } from 'lucide-react'

type SOWithUrl = SpecialOrder & { fileUrl?: string }

interface Props {
  open: boolean
  onClose: () => void
  onAdd?: (newSO: SOWithUrl) => Promise<void>
}

export function AddSpecialOrderModal({ open, onClose, onAdd }: Props) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm]       = useState({ reference: '', subject: '', date: today, status: 'ACTIVE' })
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [file, setFile]       = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const field = (key: string, value: string) => {
    setForm(p => ({ ...p, [key]: value }))
    setErrors(p => ({ ...p, [key]: '' }))
  }

  function handleFileChange(incoming: File | null) {
    if (!incoming) return
    setFile(incoming)
    setErrors(prev => ({ ...prev, file: '' }))
    setForm(prev => (prev.date ? prev : { ...prev, date: today }))
  }

  function resetAndClose() {
    setForm({ reference: '', subject: '', date: today, status: 'ACTIVE' })
    setErrors({})
    setFile(null)
    setDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  async function submit() {
    // ── Zod validation ──────────────────────────────
    const result = AddSpecialOrderSchema.safeParse(form)
    if (!result.success) {
      setErrors(zodErrors(result.error))
      return
    }

    if (!file) {
      setErrors(prev => ({ ...prev, file: 'Attachment is required.' }))
      return
    }

    setErrors({})
    setUploading(true)

    try {
      let fileUrl: string | undefined

      const fileName = `special-orders/${Date.now()}-${file.name.replace(/\s+/g, '_')}`
      const { data: storageData, error: storageError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })

      if (storageError) {
        toast.error('File upload failed. Please try again.')
        setUploading(false)
        return
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageData.path)
      fileUrl = urlData.publicUrl

      const newSO: SOWithUrl = {
        id:          `so-${Date.now()}`,
        reference:   result.data.reference,
        subject:     result.data.subject,
        date:        result.data.date,
        attachments: 0,
        status:      result.data.status as 'ACTIVE' | 'ARCHIVED',
        fileUrl,
      }

      if (onAdd) await onAdd(newSO)
      toast.success(`Special Order "${result.data.reference}" created.`)
      resetAndClose()
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const cls = (f: string) =>
    `w-full px-3 py-2.5 border-[1.5px] rounded-lg text-sm bg-slate-50 focus:outline-none focus:bg-white transition ${
      errors[f] ? 'border-red-400 focus:border-red-400' : 'border-slate-200 focus:border-blue-500'
    }`

  const fileIcon =
    file?.name.endsWith('.pdf') ? <FileText size={28} className="text-red-600" />
    : file?.name.match(/\.docx?$/i) ? <FileText size={28} className="text-blue-600" />
    : file?.name.match(/\.xlsx?$/i) ? <FileText size={28} className="text-green-600" />
    : file?.name.match(/\.(jpg|jpeg|png|webp)$/i) ? <ImageIcon size={28} className="text-violet-600" />
    : <FileText size={28} className="text-slate-600" />

  return (
    <Modal open={open} onClose={uploading ? () => {} : resetAndClose} title="New Special Order" width="max-w-lg">
      <div className="p-6 space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
              SO Reference <span className="text-red-500">*</span>
            </label>
            <input className={cls('reference')} placeholder="e.g. SO No. 2024-102"
              value={form.reference} onChange={e => field('reference', e.target.value)} disabled={uploading} />
            {errors.reference && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.reference}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" className={cls('date')}
              value={form.date} onChange={e => field('date', e.target.value)} disabled={uploading} />
            {errors.date && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.date}</p>}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
            Subject <span className="text-red-500">*</span>
          </label>
          <input className={cls('subject')} placeholder="e.g. Designation of Officers – Q2"
            value={form.subject} onChange={e => field('subject', e.target.value)} disabled={uploading} />
          {errors.subject && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.subject}</p>}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Status</label>
          <select className={cls('status')} value={form.status}
            onChange={e => field('status', e.target.value)} disabled={uploading}>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
          </select>
        </div>

        <input ref={fileInputRef} type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />

        {file ? (
          <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-[1.5px] border-blue-200 rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex-shrink-0">{fileIcon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            {!uploading && (
              <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="text-slate-400 hover:text-red-500 font-bold text-sm ml-3 flex-shrink-0 transition">✕</button>
            )}
          </div>
        ) : (
          <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files?.[0] ?? null) }}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition select-none ${
              errors.file
                ? 'border-red-400 bg-red-50'
                : dragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <div className="mb-2 flex justify-center text-blue-600"><Paperclip size={30} strokeWidth={2.1} /></div>
            <p className="text-sm font-medium text-slate-600 mb-1">Click to browse or drag &amp; drop</p>
            <p className="text-xs text-slate-400">PDF, DOCX, XLSX, JPG — max 50 MB</p>
          </div>
        )}

        {errors.file && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.file}</p>}

        {uploading && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700 font-medium">
              {file ? 'Uploading to cloud storage…' : 'Saving special order…'}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
          <Button variant="outline" onClick={resetAndClose} disabled={uploading}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={uploading || !file}>
            {uploading ? 'Uploading…' : '✅ Create SO'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}