'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { BankUploadHistory } from '@/app/api/upload-history/route'

const BANK_LABELS: Record<string, string> = {
  dbs: 'DBS',
  ocbc: 'OCBC',
  uob: 'UOB',
  trust: 'Trust',
}

function getLast6Months(): { value: string; short: string }[] {
  const now = new Date()
  const months = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const short = d.toLocaleString('en-SG', { month: 'short' })
    months.push({ value, short })
  }
  return months // newest first
}

export default function StatementCoverage() {
  const [history, setHistory] = useState<BankUploadHistory[]>([])

  useEffect(() => {
    fetch('/api/upload-history')
      .then(r => r.json())
      .then(d => { if (d.history) setHistory(d.history) })
      .catch(() => {})
  }, [])

  if (history.length === 0) return null

  const months = getLast6Months()
  const uploadedSet = new Map<string, Set<string>>() // bank -> Set of YYYY-MM
  for (const h of history) {
    uploadedSet.set(h.bank, new Set(h.months.map(m => m.month)))
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <p className="text-xs font-medium text-zinc-400">Statements</p>
        <Link
          href="/upload"
          className="text-xs text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Upload
        </Link>
      </div>

      {/* Month header row */}
      <div className="grid grid-cols-[56px_repeat(6,1fr)] gap-x-1 px-3 pb-1">
        <div />
        {months.map(m => (
          <div key={m.value} className="text-center text-[10px] text-zinc-600 font-medium">
            {m.short}
          </div>
        ))}
      </div>

      {/* Bank rows */}
      <div className="divide-y divide-zinc-800/60">
        {history.map(h => {
          const uploaded = uploadedSet.get(h.bank) ?? new Set()
          return (
            <div key={h.bank} className="grid grid-cols-[56px_repeat(6,1fr)] gap-x-1 items-center px-3 py-1.5">
              <span className="text-xs font-medium text-zinc-300 truncate">
                {BANK_LABELS[h.bank] ?? h.bank.toUpperCase()}
              </span>
              {months.map(m => {
                const has = uploaded.has(m.value)
                return (
                  <div key={m.value} className="flex justify-center">
                    <span
                      aria-label={has ? `${h.bank} ${m.value} uploaded` : `${h.bank} ${m.value} missing`}
                      className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors ${
                        has
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-zinc-800 text-zinc-600 border border-zinc-700/50'
                      }`}
                    >
                      {has ? '✓' : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
