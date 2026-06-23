'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { BANKS } from '@/lib/schema'

interface PreviewData {
  total: number
  newCount: number
  skippedCount: number
  dateFrom: string
  dateTo: string
  bank: string
}

export default function UploadPage() {
  const router = useRouter()
  const [bank, setBank] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [pendingTransactions, setPendingTransactions] = useState<unknown[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null)

  const missingApiKey = hasAnthropicKey === false

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => setHasAnthropicKey(Boolean(data.hasAnthropicKey)))
      .catch(() => setHasAnthropicKey(null))
  }, [])

  async function handleUpload() {
    if (!bank || files.length === 0) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setPendingTransactions([])

    try {
      let allTransactions: unknown[] = []
      let totalParsed = 0
      let totalNew = 0
      let totalSkipped = 0
      let dateFrom = ''
      let dateTo = ''

      const skippedFiles: string[] = []

      for (let i = 0; i < files.length; i++) {
        setProgress(`Processing file ${i + 1} of ${files.length}…`)

        const formData = new FormData()
        formData.append('file', files[i])
        formData.append('bank', bank)

        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) {
          // Skip files that fail (e.g., no transactions, wrong format) instead of aborting
          skippedFiles.push(files[i].name)
          continue
        }

        totalParsed += data.preview.total
        totalNew += data.preview.newCount
        totalSkipped += data.preview.skippedCount
        allTransactions = [...allTransactions, ...data.transactions]

        if (!dateFrom || data.preview.dateFrom < dateFrom) dateFrom = data.preview.dateFrom
        if (!dateTo || data.preview.dateTo > dateTo) dateTo = data.preview.dateTo
      }

      if (allTransactions.length === 0 && skippedFiles.length > 0) {
        setError(`No transactions found in any file. Skipped: ${skippedFiles.join(', ')}`)
        return
      }

      if (skippedFiles.length > 0) {
        setError(`Skipped ${skippedFiles.length} file${skippedFiles.length > 1 ? 's' : ''} with no transactions: ${skippedFiles.join(', ')}`)
      }

      setPreview({
        total: totalParsed,
        newCount: totalNew,
        skippedCount: totalSkipped,
        dateFrom,
        dateTo,
        bank,
      })
      setPendingTransactions(allTransactions)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    setError(null)

    try {
      const res = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: pendingTransactions }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Confirm failed')
        return
      }

      setConfirmed(true)
      setTimeout(() => router.push('/'), 1500)
    } catch {
      setError('Network error — please try again')
    } finally {
      setConfirming(false)
    }
  }

  function handleReset() {
    setPreview(null)
    setPendingTransactions([])
    setFiles([])
    setError(null)
    setConfirmed(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Upload Transactions</h1>

      {/* Missing API key warning */}
      {missingApiKey && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          <strong>Note:</strong> Set <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> in{' '}
          <code className="font-mono text-xs">.env.local</code> to enable AI categorization. Without
          it, all transactions will be labelled &quot;Others&quot;.
        </div>
      )}

      {!preview && !confirmed && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base">Select bank &amp; files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-zinc-400">Bank</label>
              <Select value={bank} onValueChange={setBank}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Select bank…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {BANKS.map(b => (
                    <SelectItem key={b} value={b} className="uppercase text-xs font-semibold tracking-wide">
                      {b.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-zinc-400">Statement files</label>
              <input
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                multiple
                className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:text-zinc-100 hover:file:bg-zinc-600"
                onChange={e => setFiles(e.target.files ? Array.from(e.target.files) : [])}
              />
              {files.length > 1 && (
                <p className="text-xs text-zinc-500">{files.length} files selected</p>
              )}
            </div>

            {error && (
              <p className="rounded bg-red-900/40 border border-red-700/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <Button
              className="w-full bg-blue-600 text-white hover:bg-blue-500"
              disabled={!bank || files.length === 0 || loading}
              onClick={handleUpload}
            >
              {loading ? (progress ?? 'Processing…') : 'Preview'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview step */}
      {preview && !confirmed && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-zinc-800 p-3">
                <p className="text-zinc-400 text-xs mb-1">Total parsed</p>
                <p className="text-xl font-mono font-semibold">{preview.total}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 p-3">
                <p className="text-zinc-400 text-xs mb-1">New</p>
                <p className="text-xl font-mono font-semibold text-green-400">{preview.newCount}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 p-3">
                <p className="text-zinc-400 text-xs mb-1">Duplicates skipped</p>
                <p className="text-xl font-mono font-semibold text-zinc-500">{preview.skippedCount}</p>
              </div>
              <div className="rounded-lg bg-zinc-800 p-3">
                <p className="text-zinc-400 text-xs mb-1">Bank</p>
                <Badge className="uppercase text-xs bg-blue-900/50 text-blue-300 border-blue-700/40">
                  {preview.bank}
                </Badge>
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              {files.length > 1 ? `${files.length} files · ` : ''}Date range: {preview.dateFrom} → {preview.dateTo}
            </p>

            {error && (
              <p className="rounded bg-red-900/40 border border-red-700/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-zinc-700" onClick={handleReset}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 text-white hover:bg-blue-500"
                disabled={confirming || preview.newCount === 0}
                onClick={handleConfirm}
              >
                {confirming ? 'Saving…' : `Import ${preview.newCount} transactions`}
              </Button>
            </div>

            {preview.newCount === 0 && (
              <p className="text-xs text-center text-zinc-500">
                All transactions already imported — nothing new to add.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {confirmed && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-10 text-center space-y-2">
            <p className="text-2xl">Done</p>
            <p className="text-sm text-zinc-400">Redirecting to home…</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
