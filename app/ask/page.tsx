'use client'

import { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import MiniBarChart from '@/components/MiniBarChart'

interface AnswerData {
  type: 'bar'
  labels: string[]
  values: number[]
}

interface Message {
  id: string
  role: 'user' | 'ai' | 'loading'
  text: string
  answer_data?: AnswerData | null
  timestamp?: string
}

interface MemoryEntry {
  id: number
  key: string
  value: string
  source: 'user' | 'inferred'
  created_at: string
}


function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-SG', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [memory, setMemory] = useState<MemoryEntry[]>([])
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load history on mount
  useEffect(() => {
    fetch('/api/ask/history')
      .then(r => r.json())
      .then(d => {
        const convs: Array<{ id: number; question: string; answer_text: string; answer_data: string | null; created_at: string }> = d.conversations ?? []
        // Build message pairs in chronological order (history is newest-first, so reverse)
        const pairs: Message[] = []
        for (const c of [...convs].reverse()) {
          pairs.push({ id: `u-${c.id}`, role: 'user', text: c.question, timestamp: c.created_at })
          let ad: AnswerData | null = null
          try { if (c.answer_data) ad = JSON.parse(c.answer_data) } catch {}
          pairs.push({ id: `a-${c.id}`, role: 'ai', text: c.answer_text, answer_data: ad, timestamp: c.created_at })
        }
        setMessages(pairs)
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [])

  // Load memory
  function loadMemory() {
    fetch('/api/memory')
      .then(r => r.json())
      .then(d => setMemory(d.entries ?? []))
      .catch(() => {})
  }

  useEffect(() => { loadMemory() }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || submitting) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: q }
    const loadingMsg: Message = { id: 'loading', role: 'loading', text: '' }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setQuestion('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: data.error ? `Error: ${data.error}` : data.text,
        answer_data: data.answer_data ?? null,
      }
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(aiMsg))
      loadMemory()
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
        id: `a-${Date.now()}`, role: 'ai', text: 'Failed to reach server.',
      }))
    } finally {
      setSubmitting(false)
      textareaRef.current?.focus()
    }
  }

  async function deleteMemory(id: number) {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' })
    setMemory(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-screen max-w-2xl mx-auto">
      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {historyLoaded && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-500 text-center px-8">
              Ask anything about your spending.<br />
              <span className="text-zinc-600">e.g. "How much on food last month?" or "That Town Vets charge is Health."</span>
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'loading') {
            return (
              <div key="loading" className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full motion-safe:animate-bounce motion-reduce:animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full motion-safe:animate-bounce motion-reduce:animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-zinc-700 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm text-zinc-100">{msg.text}</p>
                  {msg.timestamp && (
                    <p className="text-[10px] text-zinc-500 mt-1 text-right">{formatTime(msg.timestamp)}</p>
                  )}
                </div>
              </div>
            )
          }

          // AI message
          const showTime = i === 0 || messages[i - 1]?.role !== 'ai'
          return (
            <div key={msg.id} className="flex justify-start">
              <div className="bg-zinc-800/80 border border-zinc-700/40 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                {msg.answer_data && <MiniBarChart data={msg.answer_data} />}
                {msg.timestamp && showTime && (
                  <p className="text-[10px] text-zinc-600 mt-2">{formatTime(msg.timestamp)}</p>
                )}
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Bottom bar */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-2">
        {/* Memory chip */}
        <div>
          <button
            onClick={() => setMemoryOpen(o => !o)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <span className="text-zinc-600">{memoryOpen ? '▲' : '▼'}</span>
            What I remember ({memory.length})
          </button>
          {memoryOpen && (
            <div className="mt-2 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 space-y-1.5">
              {memory.length === 0 ? (
                <p className="text-xs text-zinc-600">Nothing remembered yet.</p>
              ) : (
                memory.map(m => (
                  <div key={m.id} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-zinc-400 leading-relaxed">{m.value}</span>
                    <button
                      aria-label="Forget this memory"
                      onClick={() => deleteMemory(m.id)}
                      className="text-zinc-700 hover:text-red-400 text-xs shrink-0 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder="Ask about your finances…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none leading-snug"
            rows={1}
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !question.trim()}
            className="shrink-0 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}
