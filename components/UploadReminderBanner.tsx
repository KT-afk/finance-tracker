'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Upload, X } from 'lucide-react'
import type { BankUploadStatus } from '@/app/api/upload-reminders/route'

const BANK_LABELS: Record<string, string> = {
  dbs: 'DBS/POSB',
  ocbc: 'OCBC',
  uob: 'UOB',
  trust: 'Trust',
}

const DISMISS_KEY = 'upload_reminder_dismissed_at'
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000 // Re-show after 24 hours

export default function UploadReminderBanner() {
  const [statuses, setStatuses] = useState<BankUploadStatus[]>([])
  const [dismissed, setDismissed] = useState(true) // Start hidden to avoid flash

  useEffect(() => {
    // Check if dismissed recently
    const dismissedAt = sessionStorage.getItem(DISMISS_KEY)
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_TTL_MS) return

    fetch('/api/upload-reminders')
      .then(r => r.json())
      .then(data => {
        if (data.anyNeedsReminder) {
          setStatuses(data.statuses.filter((s: BankUploadStatus) => s.needsReminder))
          setDismissed(false)
        }
      })
      .catch(() => {}) // Silently fail — reminders are non-critical
  }, [])

  if (dismissed || statuses.length === 0) return null

  const bankNames = statuses.map(s => BANK_LABELS[s.bank] ?? s.bank).join(', ')
  const maxDays = Math.max(...statuses.map(s => s.daysSinceUpload ?? 7))

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <Upload className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-amber-300">
          {statuses.length === 1 ? `${bankNames} hasn't` : `${bankNames} haven't`} been updated
        </span>
        <span className="text-amber-400/80">
          {' '}— last upload was {maxDays} day{maxDays !== 1 ? 's' : ''} ago.{' '}
        </span>
        <Link
          href="/upload"
          className="font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        >
          Upload CSV now
        </Link>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, String(Date.now()))
          setDismissed(true)
        }}
        aria-label="Dismiss upload reminder"
        className="shrink-0 text-amber-400/60 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
