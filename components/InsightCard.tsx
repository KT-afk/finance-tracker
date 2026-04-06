'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface InsightCardProps {
  hasTransactions: boolean
}

export default function InsightCard({ hasTransactions }: InsightCardProps) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const CACHE_KEY = 'insight_cache'
  const CACHE_TTL_MS = 30 * 60 * 1000

  useEffect(() => {
    if (!hasTransactions) return
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      try {
        const { text: cachedText, ts } = JSON.parse(cached)
        if (Date.now() - ts < CACHE_TTL_MS) {
          setText(cachedText)
          return
        }
      } catch {}
    }
    setLoading(true)
    setError(false)
    fetch('/api/insight', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(true)
        else {
          setText(d.text ?? null)
          if (d.text) sessionStorage.setItem(CACHE_KEY, JSON.stringify({ text: d.text, ts: Date.now() }))
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [hasTransactions])

  if (!hasTransactions) return null

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-zinc-400 font-normal flex items-center gap-2">
          <span className="text-purple-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
            </svg>
          </span>
          AI insight
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-zinc-800 rounded w-full" />
            <div className="h-3 bg-zinc-800 rounded w-5/6" />
            <div className="h-3 bg-zinc-800 rounded w-4/6" />
          </div>
        )}
        {!loading && error && (
          <p className="text-sm text-zinc-500">Couldn&apos;t load insight right now.</p>
        )}
        {!loading && !error && text && (
          <p className="text-sm text-zinc-200 leading-relaxed">{text}</p>
        )}
      </CardContent>
    </Card>
  )
}
