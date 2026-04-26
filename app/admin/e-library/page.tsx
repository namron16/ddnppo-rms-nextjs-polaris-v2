'use client'
// app/admin/e-library/page.tsx

import { useState, useEffect, useRef } from 'react'
import { PageHeader }            from '@/components/ui/PageHeader'
import { Badge }                 from '@/components/ui/Badge'
import { Button }                from '@/components/ui/Button'
import { SearchInput }           from '@/components/ui/SearchInput'
import { EmptyState }            from '@/components/ui/EmptyState'
import { ConfirmDialog }         from '@/components/ui/ConfirmDialog'
import { ToolbarSelect }         from '@/components/ui/Toolbar'
import { Modal }                 from '@/components/ui/Modal'
import { useSearch, useModal, useDisclosure } from '@/hooks'
import { useRealtimeLibraryItems } from '@/hooks/useRealtimeCollections'
import { useToast }              from '@/components/ui/Toast'
import { Paperclip } from 'lucide-react'
import { logDeleteDocument, logViewDocument }       from '@/lib/adminLogger'
import {
  getLibraryItems,
  addLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  addArchivedDoc,
  archiveLibraryItem,
  getArchivedDocs,
} from '@/lib/data'
import { supabase }              from '@/lib/supabase'
import { libraryBadgeClass }     from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import type { AdminRole } from '@/lib/auth'
import { isDocumentUnrestricted } from '@/lib/rbac'
import type { LibraryItem, LibraryCategory } from '@/types'

type LibraryItemWithUrl = LibraryItem & { fileUrl?: string; description?: string }

// ── Add Library Item Modal ────────────────────
function AddLibraryItemModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (item: LibraryItemWithUrl) => void
}) {
  const { toast }    = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile]           = useState<File | null>(null)
  const [linkUrl, setLinkUrl]     = useState('')
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    title:       '',
    category:    'MANUAL' as LibraryCategory,
    description: '',
  })

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  function handleFileChange(nextFile: File | null) {
    if (!nextFile) return
    setFile(nextFile)
    setLinkUrl('')
    setErrors(prev => ({ ...prev, file: '' }))
  }

  function resetAndClose() {
    setForm({ title: '', category: 'MANUAL', description: '' })
    setLinkUrl('')
    setErrors({})
    setFile(null)
    setDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  async function submit() {
    const nextErrors: Record<string, string> = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required.'
    if (!file && !linkUrl.trim()) nextErrors.file = 'File or URL is required.'
    if (linkUrl.trim()) {
      try {
        new URL(linkUrl.trim())
      } catch {
        nextErrors.linkUrl = 'Please enter a valid URL.'
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setUploading(true)
    try {
      let fileUrl: string | undefined
      let fileSize = 'Link'

      if (file) {
        const uploadFile: File = file
        const fileName = `library/${Date.now()}-${uploadFile.name.replace(/\s+/g, '_')}`
        const { data: storageData, error: storageError } = await supabase.storage
          .from('documents')
          .upload(fileName, uploadFile, { cacheControl: '3600', upsert: false })

        if (storageError) {
          toast.error('File upload failed. Please try again.')
          setUploading(false)
          return
        }
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(storageData.path)
        fileUrl  = urlData.publicUrl
        fileSize = (uploadFile.size / 1024 / 1024).toFixed(1) + ' MB'
      } else {
        fileUrl  = linkUrl.trim()
        fileSize = 'Link'
      }

      const today   = new Date().toISOString().split('T')[0]
      const newItem: LibraryItemWithUrl = {
        id:          `lib-${Date.now()}`,
        title:       form.title.trim(),
        category:    form.category,
        size:        fileSize,
        dateAdded:   today,
        fileUrl,
        description: form.description.trim() || undefined,
      }

      await addLibraryItem(newItem)
      toast.success(`"${form.title}" added to the Library.`)
      onAdd(newItem)
      resetAndClose()
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const hasMissingRequired = !form.title.trim() || (!file && !linkUrl.trim())

  const cls = (f: string) =>
    `w-full px-3 py-2.5 border-[1.5px] rounded-lg text-sm bg-slate-50 focus:outline-none focus:bg-white transition ${
      errors[f] ? 'border-red-400 focus:border-red-400' : 'border-slate-200 focus:border-blue-500'
    }`

  return (
    <Modal open={open} onClose={uploading ? () => {} : resetAndClose} title="Add to e-Library" width="max-w-lg">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            className={cls('title')}
            placeholder="e.g. PNP Anti-Corruption Manual 2024"
            value={form.title}
            onChange={e => field('title', e.target.value)}
            disabled={uploading}
          />
          {errors.title && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.title}</p>}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Category</label>
          <select
            className={cls('category')}
            value={form.category}
            onChange={e => field('category', e.target.value as LibraryCategory)}
            disabled={uploading}
          >
            <option value="MANUAL">Manual</option>
            <option value="GUIDELINE">Guideline</option>
            <option value="TEMPLATE">Template</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
          <textarea
            rows={3}
            className={`${cls('description')} resize-none`}
            placeholder="Brief description of this library item…"
            value={form.description}
            onChange={e => field('description', e.target.value)}
            disabled={uploading}
          />
        </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
              Link URL <span className="text-slate-400">(optional if uploading a file)</span>
            </label>
            <input
              type="url"
              className={cls('linkUrl')}
              placeholder="https://www.pnp.gov.ph/…"
              value={linkUrl}
              onChange={e => { setLinkUrl(e.target.value); setErrors(prev => ({ ...prev, linkUrl: '' })) }}
              disabled={uploading}
            />
            {errors.linkUrl && <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.linkUrl}</p>}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
          />

          {file ? (
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-[1.5px] border-blue-200 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">
                  {file.name.endsWith('.pdf')      ? '📕'
                    : file.name.match(/\.docx?$/) ? '📘'
                    : file.name.match(/\.xlsx?$/) ? '📗'
                    : '🖼️'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              {!uploading && (
                <button
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="text-slate-400 hover:text-red-500 font-bold text-sm ml-3 flex-shrink-0"
                >✕</button>
              )}
            </div>
          ) : (
            <div
              onDragOver={e  => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files?.[0] ?? null) }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                errors.file
                  ? 'border-red-400 bg-red-50'
                  : dragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <div className="text-2xl mb-1.5">📗</div>
              <p className="text-sm font-medium text-slate-600 mb-0.5">Upload file</p>
              <p className="text-xs text-slate-400">PDF, DOCX, XLSX, JPG — max 50 MB</p>
            </div>
          )}
          {!file && (
            <p className="text-xs text-slate-500 mt-2">Or paste a public PNP site URL above instead of uploading a file.</p>
          )}

          {uploading && (
            <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-700 font-medium">Uploading to cloud storage…</p>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="outline" onClick={resetAndClose} disabled={uploading}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={uploading || hasMissingRequired}>
              {uploading ? 'Uploading…' : '📚 Add to Library'}
            </Button>
          </div>
        </div>
      </Modal>
  )
}

// ── View Item Modal ───────────────────────────
function ViewItemModal({
  item,
  open,
  onClose,
  onPrint,
}: {
  item: LibraryItemWithUrl | null
  open: boolean
  onClose: () => void
  onPrint: (fileUrl: string, fileName: string, sourceDocumentId?: string) => void
}) {
  if (!item) return null

  const isPDF   = !!item.fileUrl?.match(/\.pdf(\?|$)/i)
  const isImage = !!item.fileUrl?.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)

  return (
    <Modal open={open} onClose={onClose} title="Library Item" width="max-w-4xl">
      <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Title</p>
            <p className="text-sm font-bold text-slate-800">{item.title}</p>
            {item.description && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.description}</p>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Category</p>
              <Badge className={libraryBadgeClass(item.category)}>{item.category}</Badge>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Added</p>
              <p className="text-xs text-slate-600">{item.dateAdded}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Size</p>
              <p className="text-xs text-slate-600">{item.size}</p>
            </div>
          </div>
        </div>

        {item.fileUrl ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Document Preview</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onPrint(item.fileUrl!, item.title, item.id)}
                  className="text-xs px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-md font-medium transition"
                >
                  🖨️ Print
                </button>
                <a
                  href={item.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-medium transition"
                >
                  {item.size === 'Link' ? '🔗 Open link' : '⬇ Download'}
                </a>
              </div>
            </div>
            {isPDF ? (
              <iframe src={item.fileUrl} title={item.title} className="w-full border-0" style={{ height: '500px' }} />
            ) : isImage ? (
              <img src={item.fileUrl} alt={item.title} className="w-full max-h-[500px] object-contain p-4" />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="text-4xl mb-3">📗</span>
                <p className="text-sm text-slate-500 mb-3">Preview not available for this file type.</p>
                <a href={item.fileUrl} download
                  className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                  ⬇ Download to view
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <span className="text-3xl mb-2">📗</span>
            <p className="text-sm text-slate-400">No file attached to this library item.</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

function EditLibraryItemModal({
  item,
  open,
  onClose,
  onSave,
}: {
  item: LibraryItemWithUrl | null
  open: boolean
  onClose: () => void
  onSave: (updated: LibraryItemWithUrl) => Promise<void>
}) {
  const [form, setForm] = useState({
    title: '',
    category: 'MANUAL' as LibraryCategory,
    description: '',
    dateAdded: '',
  })

  useEffect(() => {
    if (!item || !open) return
    setForm({
      title: item.title,
      category: item.category,
      description: item.description ?? '',
      dateAdded: item.dateAdded,
    })
  }, [item, open])

  if (!item) return null

  const cls = 'w-full px-3 py-2.5 border-[1.5px] border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-500 focus:bg-white transition'

  return (
    <Modal open={open} onClose={onClose} title="Edit Library Item" width="max-w-lg">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Title</label>
          <input
            className={cls}
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Category</label>
            <select
              className={cls}
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value as LibraryCategory }))}
            >
              <option value="MANUAL">Manual</option>
              <option value="GUIDELINE">Guideline</option>
              <option value="TEMPLATE">Template</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Date Added</label>
            <input
              type="date"
              className={cls}
              value={form.dateAdded}
              onChange={e => setForm(prev => ({ ...prev, dateAdded: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
          <textarea
            rows={3}
            className={`${cls} resize-none`}
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2.5 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onSave({
              ...item,
              title: form.title.trim(),
              category: form.category,
              description: form.description.trim() || undefined,
              dateAdded: form.dateAdded,
            })}
            disabled={!form.title.trim() || !form.dateAdded}
          >
            💾 Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Print File Function
// ══════════════════════════════════════════════════════════════════════════
async function printFileFromUrl(fileUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.opacity = '0'

    let settled = false
    let blobUrl: string | null = null

    const cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      fn()
    }

    const timeout = window.setTimeout(() => {
      finish(() => {
        cleanup()
        reject(new Error('Print timed out.'))
      })
    }, 15000)

    // First fetch the file as blob to create same-origin URL
    fetch(fileUrl)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`)
        return response.blob()
      })
      .then(blob => {
        blobUrl = URL.createObjectURL(blob)
        iframe.src = blobUrl

        iframe.onload = () => {
          const target = iframe.contentWindow
          if (!target) {
            finish(() => {
              cleanup()
              reject(new Error('Unable to load printable content.'))
            })
            return
          }

          window.setTimeout(() => {
            finish(() => {
              try {
                target.focus()
                target.print()
                resolve()
              } catch (error) {
                reject(error instanceof Error ? error : new Error('Print failed.'))
              } finally {
                window.setTimeout(cleanup, 1200)
              }
            })
          }, 500)
        }

        iframe.onerror = () => {
          finish(() => {
            cleanup()
            reject(new Error('Could not load file for printing.'))
          })
        }

        document.body.appendChild(iframe)
      })
      .catch(error => {
        finish(() => {
          cleanup()
          reject(error instanceof Error ? error : new Error('Failed to prepare file for printing.'))
        })
      })
  })
}

// ── Main Page ─────────────────────────────────
export default function LibraryPage() {
  const { toast }  = useToast()
  const { user } = useAuth()
  const [items, setItems]     = useState<LibraryItemWithUrl[]>([])
  useRealtimeLibraryItems(setItems as any)
  const [loading, setLoading] = useState(true)
  const [catFilter, setCat]   = useState<LibraryCategory | 'ALL'>('ALL')

  const canUploadLibrary = user?.permissions.canUpload ?? false
  const isSuperAdmin = user?.role === 'P1'

  const newModal    = useModal()
  const viewDisc    = useDisclosure<LibraryItemWithUrl>()
  const editDisc    = useDisclosure<LibraryItemWithUrl>()
  const archiveDisc = useDisclosure<LibraryItemWithUrl>()
  const deleteDisc  = useDisclosure<LibraryItemWithUrl>()

  const { query, setQuery, filtered: searched } = useSearch(
    items,
    ['title'] as Array<keyof LibraryItemWithUrl>
  )
  const filtered = searched.filter(i => catFilter === 'ALL' || i.category === catFilter)

  useEffect(() => {
    Promise.all([getLibraryItems(), getArchivedDocs()]).then(([data, archived]) => {
      const archivedIds = new Set(
        (archived ?? [])
          .map((a: any) => String(a.id ?? ''))
          .filter((id: string) => id.startsWith('arc-lib-'))
          .map((id: string) => id.replace('arc-lib-', ''))
      )
      setItems((data as LibraryItemWithUrl[]).filter(item => !archivedIds.has(item.id)))
      setLoading(false)
    })
  }, [])

  function handleAdd(newItem: LibraryItemWithUrl) {
    if (!canUploadLibrary) {
      toast.error('Only P1–P10 accounts can add e-Library items.')
      return
    }

    setItems(prev => [newItem, ...prev])
  }

  async function handleArchive() {
    if (!isSuperAdmin) {
      toast.error('Only P1 can archive e-Library items.')
      return
    }

    const item = archiveDisc.payload
    if (!item) return

    const today = new Date().toISOString().split('T')[0]

    // Insert into archived_docs
    await addArchivedDoc({
      id:           `arc-lib-${item.id}`,
      title:        item.title,
      type:         'Library Item',
      archivedDate: today,
      archivedBy:   'Admin',
    })

    await archiveLibraryItem(item.id)

    setItems(prev => prev.filter(i => i.id !== item.id))
    toast.success(`"${item.title}" has been archived.`)
    archiveDisc.close()
  }

  async function handleSave(updated: LibraryItemWithUrl) {
    if (!isSuperAdmin) {
      toast.error('Only Super Admin can edit e-Library items.')
      return
    }

    await updateLibraryItem(updated)
    setItems(prev => prev.map(item => item.id === updated.id ? updated : item))
    if (viewDisc.payload?.id === updated.id) {
      viewDisc.open(updated)
    }
    toast.success('Library item updated.')
    editDisc.close()
  }

  async function handleDelete() {
    const item = deleteDisc.payload
    if (!item) return
    if (!isSuperAdmin) {
      toast.error('Only Super Admin (P1) can delete e-Library items.')
      return
    }

    await deleteLibraryItem(item.id)
    await logDeleteDocument(item.title, 'library item', user?.role as AdminRole)
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (viewDisc.payload?.id === item.id) viewDisc.close()
    if (editDisc.payload?.id === item.id) editDisc.close()
    toast.success(`"${item.title}" deleted permanently.`)
    deleteDisc.close()
  }

  const handlePrintFile = async (
    fileUrl: string,
    fileName: string,
    sourceDocumentId?: string,
  ) => {
    try {
      if (user && !isSuperAdmin) {
        if (!sourceDocumentId) {
          toast.error('Printing/downloading is only allowed for files approved by P1.')
          return
        }

        // Check if document is unrestricted (open to all without approval)
        await isDocumentUnrestricted(sourceDocumentId, 'library')
      }

      await printFileFromUrl(fileUrl)

      toast.success(`Opened print preview for "${fileName}".`)
    } catch (error) {
      console.error('print error:', error)
      toast.error('Could not print the file.')
    }
  }

  const categoryStats = {
    ALL:       items.length,
    MANUAL:    items.filter(i => i.category === 'MANUAL').length,
    GUIDELINE: items.filter(i => i.category === 'GUIDELINE').length,
    TEMPLATE:  items.filter(i => i.category === 'TEMPLATE').length,
  }

  return (
    <>
      <PageHeader title="e-Library" />

      <div className="p-8 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'All Items',  value: categoryStats.ALL,       icon: '📚', bg: 'bg-blue-50',   txt: 'text-blue-700'   },
            { label: 'Manuals',    value: categoryStats.MANUAL,    icon: '📖', bg: 'bg-amber-50',  txt: 'text-amber-700'  },
            { label: 'Guidelines', value: categoryStats.GUIDELINE, icon: '📋', bg: 'bg-violet-50', txt: 'text-violet-700' },
            { label: 'Templates',  value: categoryStats.TEMPLATE,  icon: '📄', bg: 'bg-sky-50',    txt: 'text-sky-700'    },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3`}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <div className={`text-2xl font-extrabold ${s.txt}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main table */}
        <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden">

          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search library…"
              className="max-w-xs flex-1"
            />
            <ToolbarSelect
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCat(e.target.value as LibraryCategory | 'ALL')
              }
            >
              <option value="ALL">All Categories</option>
              <option value="MANUAL">Manual</option>
              <option value="GUIDELINE">Guideline</option>
              <option value="TEMPLATE">Template</option>
            </ToolbarSelect>
            {canUploadLibrary && (
              <Button variant="primary" size="sm" className="ml-auto" onClick={newModal.open}>
                + Add to Library
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="📚"
              title="No items found"
              description={
                query || catFilter !== 'ALL'
                  ? 'Try adjusting your search or category filter.'
                  : 'Add your first library item to get started.'
              }
              action={
                !query && catFilter === 'ALL'
                  ? (canUploadLibrary ? <Button variant="primary" size="sm" onClick={newModal.open}>+ Add to Library</Button> : undefined)
                  : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Title', 'Category', 'Size', 'Date Added', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span>📗</span>
                          <span className="font-semibold text-sm text-slate-800">{item.title}</span>
                          {item.fileUrl && (
                            <span className="inline-flex items-center bg-emerald-50 text-emerald-600 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200">
                                <Paperclip size={11} />
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-slate-400 mt-0.5 ml-6 truncate max-w-xs">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className={libraryBadgeClass(item.category)}>{item.category}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">{item.size}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">
                        <div className="flex flex-col gap-0.5">
                         
                          {item.created_at && (
                            <span className="text-xs">📅 {new Date(item.created_at).toLocaleString('en-PH', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              viewDisc.open(item)
                              logViewDocument(item.title).catch(() => {})
                            }}
                          >
                            👁
                          </Button>
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => editDisc.open(item)}>✏️</Button>
                          )}
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => deleteDisc.open(item)}>🗑️</Button>
                          )}
                          {item.fileUrl && (
                            <a href={item.fileUrl} download target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">⬇</Button>
                            </a>
                          )}
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => archiveDisc.open(item)}>🗄️</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {canUploadLibrary && (
        <AddLibraryItemModal
          open={newModal.isOpen}
          onClose={newModal.close}
          onAdd={handleAdd}
        />
      )}

      <ViewItemModal
        item={viewDisc.payload ?? null}
        open={viewDisc.isOpen}
        onClose={viewDisc.close}
        onPrint={handlePrintFile}
      />

      {isSuperAdmin && (
        <EditLibraryItemModal
          item={editDisc.payload ?? null}
          open={editDisc.isOpen}
          onClose={editDisc.close}
          onSave={handleSave}
        />
      )}

      {isSuperAdmin && (
        <ConfirmDialog
          open={archiveDisc.isOpen}
          title="Archive Library Item"
          message={`Archive "${archiveDisc.payload?.title}"? It will be moved to the Archive page and can be restored from there.`}
          confirmLabel="Archive"
          variant="danger"
          onConfirm={handleArchive}
          onCancel={archiveDisc.close}
        />
      )}

      <ConfirmDialog
        open={deleteDisc.isOpen}
        title="Delete Library Item"
        message={`Delete "${deleteDisc.payload?.title}" permanently? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={deleteDisc.close}
      />
    </>
  )
}