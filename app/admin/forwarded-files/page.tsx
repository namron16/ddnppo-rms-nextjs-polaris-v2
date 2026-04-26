'use client'
// app/admin/inbox/page.tsx
// Inbox page for P1 (sent view) and P2-P10 (received view)

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Toolbar, ToolbarSelect } from '@/components/ui/Toolbar'
import { InboxItem, InboxStatus } from '@/types'
import { AdminRole } from '@/lib/auth'
import { saveInboxItemToPage } from '@/lib/forwarding'
import { logAction } from '@/lib/adminLogger'

export default function InboxPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [expandedItem, setExpandedItem] = useState<InboxItem | null>(null)
  const [savingItem, setSavingItem] = useState<string | null>(null)

  const isP1 = user?.role === 'P1'
  const isRecipient = !isP1

  // Fetch inbox items
  useEffect(() => {
    if (!user) return

    const fetchItems = async () => {
      setLoading(true)
      const baseQuery = supabase
        .from('inbox_items')
        .select('*')
        .eq(isP1 ? 'sender_id' : 'recipient_id', user.role)

      let { data, error } = await baseQuery.order('forwarded_at', { ascending: false })

      if (error && error.code === '42703') {
        const fallback = await baseQuery.order('created_at', { ascending: false })
        data = fallback.data
        error = fallback.error
      }

      if (error) {
        console.error('Error fetching inbox items:', error)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    }

    fetchItems()
  }, [user, isP1])

  // Realtime updates
  useRealtimeTable('inbox_items', {
    onInsert: (row) => {
      if ((isP1 && row.sender_id === user?.role) || (!isP1 && row.recipient_id === user?.role)) {
        setItems(prev => [row as InboxItem, ...prev])
      }
    },
    onUpdate: (row) => {
      setItems(prev => prev.map(item =>
        item.id === row.id ? { ...item, ...row } as InboxItem : item
      ))
    },
    onDelete: (row) => {
      setItems(prev => prev.filter(item => item.id !== row.id))
    },
  })

  const markAsRead = async (itemId: string) => {
    const { error } = await supabase
      .from('inbox_items')
      .update({ status: 'read' })
      .eq('id', itemId)

    if (!error) {
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, status: 'read' } : item
      ))
    }
  }

  const markSelectedAsRead = async () => {
    const ids = Array.from(selectedItems)
    const { error } = await supabase
      .from('inbox_items')
      .update({ status: 'read' })
      .in('id', ids)

    if (!error) {
      setItems(prev => prev.map(item =>
        ids.includes(item.id) ? { ...item, status: 'read' } : item
      ))
      setSelectedItems(new Set())
    }
  }

  const saveToPage = async (item: InboxItem, targetPage: 'master' | 'admin_order' | 'daily_journal' | 'library') => {
    if (!user) return

    setSavingItem(item.id)
    const success = await saveInboxItemToPage(item.id, user.role as AdminRole, targetPage)

    if (success) {
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, status: 'saved', saved_to: targetPage, saved_at: new Date().toISOString() } : i
      ))
      await logAction('save_inbox_item', `Saved inbox item "${item.document_title}" to ${targetPage}`, user.role)
    }

    setSavingItem(null)
  }

  const recallItem = async (itemId: string) => {
    // For P1 to recall sent items
    const { error } = await supabase
      .from('inbox_items')
      .delete()
      .eq('id', itemId)
      .eq('sender_id', 'P1')

    if (!error) {
      setItems(prev => prev.filter(item => item.id !== itemId))
      await logAction('recall_inbox_item', `Recalled inbox item`, 'P1')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  const unreadCount = items.filter(item => item.status === 'unread').length

  return (
    <div className="space-y-6">
      <PageHeader
        title={isP1 ? "Sent Items" : "Inbox"}
      />

      {items.length === 0 ? (
        <EmptyState
          icon="📥"
          title={isP1 ? "No sent items" : "Inbox empty"}
          description={isP1 ? "Documents you forward will appear here" : "Forwarded documents will appear here"}
        />
      ) : (
        <>
          {/* Toolbar for bulk actions */}
          {selectedItems.size > 0 && (
            <Toolbar>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  {selectedItems.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markSelectedAsRead}
                >
                  Mark as Read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItems(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            </Toolbar>
          )}

          {/* Items List */}
          <div className="space-y-3">
            {items.map(item => (
              <InboxItemCard
                key={item.id}
                item={item}
                isP1={isP1}
                isSelected={selectedItems.has(item.id)}
                onSelect={() => {
                  setSelectedItems(prev => {
                    const newSet = new Set(prev)
                    if (newSet.has(item.id)) {
                      newSet.delete(item.id)
                    } else {
                      newSet.add(item.id)
                    }
                    return newSet
                  })
                }}
                onExpand={() => setExpandedItem(item)}
                onMarkRead={() => markAsRead(item.id)}
                onSave={isRecipient ? (page) => saveToPage(item, page) : undefined}
                onRecall={isP1 ? () => recallItem(item.id) : undefined}
                saving={savingItem === item.id}
              />
            ))}
          </div>
        </>
      )}

      {/* Expanded Item Modal */}
      {expandedItem && (
        <InboxItemModal
          item={expandedItem}
          isP1={isP1}
          onClose={() => setExpandedItem(null)}
          onSave={isRecipient ? (page) => saveToPage(expandedItem, page) : undefined}
          onRecall={isP1 ? () => recallItem(expandedItem.id) : undefined}
          saving={savingItem === expandedItem.id}
        />
      )}
    </div>
  )
}

interface InboxItemCardProps {
  item: InboxItem
  isP1: boolean
  isSelected: boolean
  onSelect: () => void
  onExpand: () => void
  onMarkRead: () => void
  onSave?: (page: 'master' | 'admin_order' | 'daily_journal' | 'library') => void
  onRecall?: () => void
  saving: boolean
}

function InboxItemCard({
  item,
  isP1,
  isSelected,
  onSelect,
  onExpand,
  onMarkRead,
  onSave,
  onRecall,
  saving
}: InboxItemCardProps) {
  const isUnread = item.status === 'unread'
  const isSaved = item.status === 'saved'
  const itemDate = item.forwarded_at ?? item.created_at

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
    } ${isUnread ? 'bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox for selection */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="mt-1"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-slate-900 truncate">
              {item.document_title}
            </h3>
            {isUnread && (
              <Badge className="bg-red-100 text-red-700 border-red-200">
                Unread
              </Badge>
            )}
            {isSaved && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                Saved to {item.saved_to}
              </Badge>
            )}
          </div>

          <div className="text-sm text-slate-600 mb-2">
            {isP1 ? (
              <>Sent to {item.recipient_id} • {itemDate ? new Date(itemDate).toLocaleString('en-PH', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : '—'}</>
            ) : (
              <>From {item.sender_id} • {itemDate ? new Date(itemDate).toLocaleString('en-PH', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : '—'}</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onExpand}>
              View Details
            </Button>
            {isUnread && (
              <Button variant="ghost" size="sm" onClick={onMarkRead}>
                Mark as Read
              </Button>
            )}
            {onSave && !isSaved && (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSave('master')}
                  disabled={saving}
                >
                  Save to Master
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSave('admin_order')}
                  disabled={saving}
                >
                  Save to Admin Orders
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSave('daily_journal')}
                  disabled={saving}
                >
                  Save to Daily Journal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSave('library')}
                  disabled={saving}
                >
                  Save to Library
                </Button>
              </div>
            )}
            {onRecall && (
              <Button variant="danger" size="sm" onClick={onRecall}>
                Recall
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface InboxItemModalProps {
  item: InboxItem
  isP1: boolean
  onClose: () => void
  onSave?: (page: 'master' | 'admin_order' | 'daily_journal' | 'library') => void
  onRecall?: () => void
  saving: boolean
}

function InboxItemModal({ item, isP1, onClose, onSave, onRecall, saving }: InboxItemModalProps) {
  const attachments = JSON.parse(item.attachments || '[]')
  const itemDate = item.forwarded_at ?? item.created_at

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={item.document_title}
      width="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Document Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Type</label>
            <p className="text-sm text-slate-900">{item.document_type}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              {isP1 ? 'Sent to' : 'From'}
            </label>
            <p className="text-sm text-slate-900">
              {isP1 ? item.recipient_id : item.sender_id}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Date</label>
            <p className="text-sm text-slate-900">
              {itemDate ? new Date(itemDate).toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Status</label>
            <p className="text-sm text-slate-900 capitalize">{item.status}</p>
          </div>
        </div>

        {/* Document Data */}
        {item.document_data && (
          <div>
            <label className="text-sm font-medium text-slate-700">Document Details</label>
            <pre className="text-sm text-slate-900 bg-slate-50 p-3 rounded mt-1 overflow-auto max-h-40">
              {JSON.stringify(item.document_data, null, 2)}
            </pre>
          </div>
        )}

        {/* Primary File */}
        {item.file_url && (
          <div>
            <label className="text-sm font-medium text-slate-700">Primary File</label>
            <div className="mt-1">
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                View File
              </a>
            </div>
          </div>
        )}

        {/* Attachments Tree */}
        {attachments.length > 0 && (
          <div>
            <label className="text-sm font-medium text-slate-700">Attachments</label>
            <div className="mt-2 space-y-1">
              {attachments.map((att: any) => (
                <AttachmentTree key={att.id} attachment={att} level={0} />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          {onSave && item.status !== 'saved' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave('master')}
                disabled={saving}
              >
                Save to Master
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave('admin_order')}
                disabled={saving}
              >
                Save to Admin Orders
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave('daily_journal')}
                disabled={saving}
              >
                Save to Daily Journal
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave('library')}
                disabled={saving}
              >
                Save to Library
              </Button>
            </div>
          )}
          {onRecall && (
            <Button variant="danger" size="sm" onClick={onRecall}>
              Recall Item
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AttachmentTree({ attachment, level }: { attachment: any; level: number }) {
  return (
    <div className={`flex items-center gap-2 ${level > 0 ? 'ml-4' : ''}`}>
      <span className="text-slate-400">{'  '.repeat(level)}📎</span>
      <span className="text-sm text-slate-900">{attachment.file_name}</span>
      <span className="text-xs text-slate-500">({attachment.file_size})</span>
      {attachment.children && attachment.children.length > 0 && (
        <div className="ml-4">
          {attachment.children.map((child: any) => (
            <AttachmentTree key={child.id} attachment={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
