'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import {
  Sparkles, Send, Bot, User, Edit2, Check, X,
  Trash2, BookOpen, RefreshCw, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thesisUpdated?: boolean
}

// ── Welcome message (static — no API call) ────────────────────────────────────

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm your personal AI financial advisor. I have full real-time visibility into your portfolio — positions, allocations, P&L, and market data.\n\n" +
    "Here's what I can help with:\n" +
    "• Analyse specific holdings or sectors\n" +
    "• Review your allocation and suggest rebalancing\n" +
    "• Discuss risk, benchmarks, or market context\n" +
    "• Remember your investment strategy so future AI insights stay aligned\n\n" +
    "Tell me about your investment philosophy, or just ask anything about your portfolio.",
}

// ── Thesis Card ───────────────────────────────────────────────────────────────

interface ThesisCardProps {
  thesis: string | null
  updatedAt: string | null
  onSaved: (thesis: string | null, updatedAt: string) => void
}

function ThesisCard({ thesis, updatedAt, onSaved }: ThesisCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(thesis ?? '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(thesis ?? '')
      textareaRef.current?.focus()
    }
  }, [editing, thesis])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/thesis', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis: draft.trim() || null }),
      })
      const data = await res.json()
      onSaved(data.thesis, data.updatedAt)
      setEditing(false)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  async function handleClear() {
    if (!confirm('Clear your investment thesis? This will affect all future AI insights.')) return
    setSaving(true)
    try {
      await fetch('/api/settings/thesis', { method: 'DELETE' })
      onSaved(null, new Date().toISOString())
      setEditing(false)
      setDraft('')
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Investment Thesis
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-slate-600 hover:text-slate-300 transition-colors p-1"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {thesis && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="text-slate-600 hover:text-rose-400 transition-colors p-1"
                  title="Clear thesis"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-slate-600 hover:text-emerald-400 transition-colors p-1"
                title="Save"
              >
                {saving
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-slate-600 hover:text-indigo-400 transition-colors p-1"
              title="Edit thesis"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Describe your investment strategy: risk tolerance, preferred sectors, assets you avoid, time horizon, specific rules…"
            className="w-full text-sm text-slate-300 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 leading-relaxed"
            rows={6}
          />
        ) : thesis ? (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{thesis}</p>
        ) : (
          <div className="flex items-start gap-2.5 text-slate-500">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-600" />
            <p className="text-sm leading-relaxed">
              No investment thesis saved yet. Tell the advisor your strategy in the chat,
              or click <span className="text-indigo-400">edit</span> to write it directly.
              All AI insights will align with your thesis once set.
            </p>
          </div>
        )}

        {updatedAt && !editing && (
          <p className="text-[10px] text-slate-600 mt-3">
            Last updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full mt-0.5',
        isUser ? 'bg-indigo-600' : 'bg-slate-700 ring-1 ring-slate-600'
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-white" />
          : <Bot className="h-3.5 w-3.5 text-indigo-400" />}
      </div>

      {/* Bubble */}
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser
          ? 'bg-indigo-600 text-white rounded-tr-sm'
          : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/60'
      )}>
        {/* Thesis saved badge */}
        {message.thesisUpdated && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 rounded-full px-2.5 py-0.5 w-fit">
            <Check className="h-3 w-3" />
            Investment thesis saved
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 ring-1 ring-slate-600 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-indigo-400" />
      </div>
      <div className="bg-slate-800 border border-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3.5">
        <div className="flex gap-1.5 items-center">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [thesis, setThesis] = useState<string | null>(null)
  const [thesisUpdatedAt, setThesisUpdatedAt] = useState<string | null>(null)
  const [thesisLoading, setThesisLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load current thesis on mount
  useEffect(() => {
    fetch('/api/settings/thesis')
      .then((r) => r.json())
      .then((data) => {
        setThesis(data.thesis ?? null)
        setThesisUpdatedAt(data.updatedAt ?? null)
      })
      .catch(() => {})
      .finally(() => setThesisLoading(false))
  }, [])

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleThesisSaved = useCallback((newThesis: string | null, updatedAt: string) => {
    setThesis(newThesis)
    setThesisUpdatedAt(updatedAt)
  }, [])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    // Build history for API (exclude the static welcome message from API calls
    // since it wasn't actually generated by Claude — it would confuse the context)
    const history = updatedMessages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Request failed')
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        thesisUpdated: data.thesisUpdated ?? false,
      }
      setMessages((prev) => [...prev, aiMsg])

      // Update thesis card if it was saved by the AI during this turn
      if (data.thesisUpdated && data.newThesis) {
        setThesis(data.newThesis)
        setThesisUpdatedAt(new Date().toISOString())
      }
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function clearChat() {
    if (!confirm('Clear chat history?')) return
    setMessages([WELCOME])
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="AI Advisor" />

      <main className="flex-1 p-6 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full flex flex-col lg:flex-row gap-6">

          {/* ── Left column: Thesis + info ──────────────────────────────── */}
          <div className="lg:w-80 flex-shrink-0 space-y-4">

            {/* Thesis card */}
            {thesisLoading ? (
              <div className="h-48 rounded-xl bg-slate-800 animate-pulse" />
            ) : (
              <ThesisCard
                thesis={thesis}
                updatedAt={thesisUpdatedAt}
                onSaved={handleThesisSaved}
              />
            )}

            {/* How it works */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  How It Works
                </span>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Your full portfolio (holdings, P&L, allocations) is included in every message.',
                  'When you describe your strategy, the AI saves it automatically — no extra steps.',
                  'Saved thesis is used in Dashboard insights and monthly reports.',
                  'Chat history is session-only. Thesis persists across sessions.',
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-600" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Right column: Chat ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">

            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/30 ring-1 ring-indigo-500/40">
                  <Bot className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">AI Advisor</p>
                  <p className="text-[10px] text-slate-500">Powered by Claude claude-sonnet-4-6 · Live portfolio context</p>
                </div>
              </div>
              <button
                onClick={clearChat}
                className="text-slate-600 hover:text-rose-400 transition-colors p-1.5"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-800 p-4 flex-shrink-0">
              <div className="flex gap-3 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your portfolio, or describe your investment strategy…"
                  disabled={loading}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 text-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white border-transparent h-[74px] px-4 rounded-xl flex-shrink-0"
                >
                  {loading
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-slate-600 mt-2 text-center">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
