'use client'

import React, { useRef, useEffect } from 'react'
import type { AgentMessage, RecentInsight, ChatRole, AgentDomain } from '@/app/lib/agents/types'

// ─── Agent display config ────────────────────────────────────────────

interface AgentStyle {
  icon: string
  label: string
  labelColor: string
  messageBg: string
}

const AGENT_STYLES: Record<string, AgentStyle> = {
  trainer:       { icon: '🏋️', label: 'Trainer',       labelColor: 'text-blue-700 dark:text-blue-400',   messageBg: 'bg-blue-50 dark:bg-blue-900/30' },
  nutritionist:  { icon: '🥗', label: 'Nutritionist',  labelColor: 'text-green-700 dark:text-green-400', messageBg: 'bg-green-50 dark:bg-green-900/30' },
  socius:        { icon: '🔮', label: 'Socius',         labelColor: 'text-purple-700 dark:text-purple-400', messageBg: 'bg-purple-50 dark:bg-purple-900/30' },
  system:        { icon: '⚙️', label: 'System',         labelColor: 'text-gray-500 dark:text-gray-400',  messageBg: 'bg-gray-50 dark:bg-gray-800' },
}

function getAgentStyle(role: ChatRole, domain?: AgentDomain): AgentStyle {
  if (role === 'user') {
    return { icon: '', label: 'You', labelColor: 'text-gray-900 dark:text-gray-100', messageBg: 'bg-white dark:bg-gray-700' }
  }
  const key = domain ?? role
  return AGENT_STYLES[key] ?? AGENT_STYLES.system
}

// ─── Props ───────────────────────────────────────────────────────────

export interface ChatAreaProps {
  messages: AgentMessage[]
  isLoading: boolean
  urgentInsights: RecentInsight[]
  onDismissInsight: (id: string) => void
}

// ─── Component ───────────────────────────────────────────────────────

export default function ChatArea({ messages, isLoading, urgentInsights, onDismissInsight }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto" role="log" aria-label="Chat messages" aria-live="polite">
      {/* Urgent insight banners */}
      {urgentInsights.length > 0 && (
        <div className="sticky top-0 z-10 space-y-2 p-3">
          {urgentInsights.map((insight) => (
            <div
              key={insight.id}
              role="alert"
              className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 px-4 py-3"
            >
              <span className="text-amber-600 dark:text-amber-400 text-lg shrink-0" aria-hidden="true">⚠️</span>
              <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">{insight.content}</p>
              <button
                onClick={() => onDismissInsight(insight.id)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                aria-label={`Dismiss insight: ${insight.content}`}
                style={{ touchAction: 'manipulation' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-center text-base">Start a conversation — log a workout, snap a meal, or ask a question.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user'
          const style = getAgentStyle(msg.role, msg.domain)

          return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[70%] ${isUser ? 'order-1' : ''}`}>
                {/* Agent label */}
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-1 ml-1">
                    <span aria-hidden="true">{style.icon}</span>
                    <span className={`text-xs font-medium ${style.labelColor}`}>{style.label}</span>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-base leading-relaxed ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : `${style.messageBg} text-gray-900 dark:text-gray-100 rounded-bl-md`
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] sm:max-w-[70%]">
              <div className="flex items-center gap-1.5 mb-1 ml-1">
                <span aria-hidden="true">💬</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Thinking…</span>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-3" aria-label="Agent is typing">
                <div className="flex gap-1.5" role="status">
                  <span className="sr-only">Agent is typing</span>
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
