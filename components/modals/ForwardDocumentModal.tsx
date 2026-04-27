'use client'
// components/modals/ForwardDocumentModal.tsx
// Modal for P1 to forward documents to P2-P10 with recipient selection and preview

import React, { useState, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { forwardDocument, buildAttachmentTree, type ForwardPayload } from '@/lib/forwarding'
import { AdminRole } from '@/lib/auth'
import { useToast } from '@/components/ui/Toast'
import { FileText, Users } from 'lucide-react'

interface ForwardDocumentModalProps {
  open: boolean
  onClose: () => void
  document: {
    id: string
    title: string
    type: string
    fileUrl?: string
    documentType: 'master' | 'admin_order' | 'daily_journal' | 'library'
  }
  documentData: Record<string, any>
  attachmentsMap: Map<string, any[]>
  onForwarded: () => void
  senderRole: AdminRole
}

const RECIPIENT_ROLES: AdminRole[] = ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']
const ALL_FORWARDABLE_ROLES: AdminRole[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']

export function ForwardDocumentModal({
  open,
  onClose,
  document,
  documentData,
  attachmentsMap,
  onForwarded,
  senderRole
}: ForwardDocumentModalProps) {
  const [selectedRecipients, setSelectedRecipients] = useState<Set<AdminRole>>(new Set())
  const [isForwarding, setIsForwarding] = useState(false)
  const { toast } = useToast()

  // Calculate available recipients (all forwardable roles except sender)
  const availableRecipients = useMemo(() => {
    return ALL_FORWARDABLE_ROLES.filter(role => role !== senderRole)
  }, [senderRole])

  // Calculate attachment statistics
  const attachmentStats = useMemo(() => {
    const attachmentTree = buildAttachmentTree(document.id, attachmentsMap)
    let totalAttachments = 0
    let maxDepth = 0

    function countAttachments(nodes: any[], depth: number = 0): void {
      maxDepth = Math.max(maxDepth, depth)
      for (const node of nodes) {
        totalAttachments++
        if (node.children && node.children.length > 0) {
          countAttachments(node.children, depth + 1)
        }
      }
    }

    countAttachments(attachmentTree)
    return { totalAttachments, maxDepth }
  }, [document.id, attachmentsMap])

  const handleSelectAll = () => {
    if (selectedRecipients.size === availableRecipients.length) {
      setSelectedRecipients(new Set())
    } else {
      setSelectedRecipients(new Set(availableRecipients))
    }
  }

  const handleRecipientToggle = (role: AdminRole) => {
    const newSelected = new Set(selectedRecipients)
    if (newSelected.has(role)) {
      newSelected.delete(role)
    } else {
      newSelected.add(role)
    }
    setSelectedRecipients(newSelected)
  }

  const handleForward = async () => {
    if (selectedRecipients.size === 0) {
      toast.error('No recipients selected. Please select at least one recipient to forward the document.')
      return
    }

    setIsForwarding(true)
    try {
      const payload: ForwardPayload = {
        documentType: document.documentType,
        documentId: document.id,
        documentTitle: document.title,
        recipients: Array.from(selectedRecipients),
        senderId: senderRole
      }

      const result = await forwardDocument(payload, documentData, attachmentsMap)

      if (result.success) {
        toast.success(`Document forwarded successfully. Forwarded to ${result.count} recipient${result.count !== 1 ? 's' : ''}.`)
        onForwarded()
        onClose()
        // Reset form
        setSelectedRecipients(new Set())
      } else {
        toast.error('Forward failed. There was an error forwarding the document. Please try again.')
      }
    } catch (error) {
      console.error('Forward error:', error)
      toast.error('Forward failed. An unexpected error occurred. Please try again.')
    } finally {
      setIsForwarding(false)
    }
  }

  const handleClose = () => {
    if (!isForwarding) {
      onClose()
      setSelectedRecipients(new Set())
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Forward Document"
      width="max-w-lg"
    >
      <div className="p-4 md:p-5 space-y-4">
        {/* Document Preview */}
        <div className="bg-slate-50 rounded-lg p-3 border">
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-slate-900 truncate">{document.title}</h3>
              <p className="text-xs text-slate-600 mt-1">
                Type: {document.type} • {attachmentStats.totalAttachments} attachment{attachmentStats.totalAttachments !== 1 ? 's' : ''}
                {attachmentStats.maxDepth > 0 && ` across ${attachmentStats.maxDepth + 1} level${attachmentStats.maxDepth + 1 !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {/* Recipient Selection */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <label className="text-sm font-medium text-slate-900">Select Recipients</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="ml-auto text-xs"
            >
              {selectedRecipients.size === availableRecipients.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {availableRecipients.map(role => (
              <label key={role} className="flex items-center gap-2 p-2.5 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedRecipients.has(role)}
                  onChange={() => handleRecipientToggle(role)}
                  className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-900">{role}</span>
                  <span className="text-xs text-slate-600 ml-1.5">
                    {role === 'P2' ? 'Classified Documents' : 'Admin Officer'}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {selectedRecipients.size > 0 && (
            <div className="mt-3">
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {selectedRecipients.size} recipient{selectedRecipients.size !== 1 ? 's' : ''} selected
              </Badge>
            </div>
          )}
        </div>

        {/* Forward Summary */}
        {selectedRecipients.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="text-sm font-medium text-blue-900 mb-1.5">Forward Summary</h4>
            <div className="text-xs text-blue-800 space-y-1">
              <p>• Document: <strong>{document.title}</strong></p>
              <p>• Recipients: <strong>{Array.from(selectedRecipients).join(', ')}</strong></p>
              <p>• Attachments: <strong>{attachmentStats.totalAttachments} file{attachmentStats.totalAttachments !== 1 ? 's' : ''}</strong></p>
              {attachmentStats.maxDepth > 0 && (
                <p>• Hierarchy: <strong>{attachmentStats.maxDepth + 1} level{attachmentStats.maxDepth + 1 !== 1 ? 's' : ''} deep</strong></p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isForwarding}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleForward}
            disabled={selectedRecipients.size === 0 || isForwarding}
          >
            {isForwarding ? 'Forwarding...' : `Forward to ${selectedRecipients.size} Recipient${selectedRecipients.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}