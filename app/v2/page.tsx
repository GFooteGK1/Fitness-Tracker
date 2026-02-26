'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { createClient } from '@/app/lib/auth/supabase-client'
import type { AgentRequest, AgentResponse } from '@/app/lib/agents/types'

// ============================================================
// TYPES
// ============================================================
interface Message {
  id: string
  role: 'user' | 'trainer' | 'nutritionist' | 'socius' | 'system'
  content: string
  time: string
}

interface Macros {
  protein: number
  carbs: number
  fat: number
  calories: number
}

interface ProgramBlock {
  title: string
  movements: string[]
}

// ============================================================
// AGENT CONFIG
// ============================================================
const AGENTS = {
  trainer: { 
    label: 'Trainer', 
    icon: '🏋️', 
    colorLight: 'rgb(37, 99, 235)', 
    colorDark: 'rgb(96, 165, 250)',
    bgLight: 'rgba(37, 99, 235, 0.08)', 
    bgDark: 'rgba(96, 165, 250, 0.15)',
    borderLight: 'rgba(37, 99, 235, 0.2)',
    borderDark: 'rgba(96, 165, 250, 0.3)'
  },
  nutritionist: { 
    label: 'Nutritionist', 
    icon: '🍽️', 
    colorLight: 'rgb(22, 163, 74)', 
    colorDark: 'rgb(74, 222, 128)',
    bgLight: 'rgba(22, 163, 74, 0.08)', 
    bgDark: 'rgba(74, 222, 128, 0.15)',
    borderLight: 'rgba(22, 163, 74, 0.2)',
    borderDark: 'rgba(74, 222, 128, 0.3)'
  },
  socius: { 
    label: 'Socius', 
    icon: '📊', 
    colorLight: 'rgb(124, 58, 237)', 
    colorDark: 'rgb(168, 85, 247)',
    bgLight: 'rgba(124, 58, 237, 0.08)', 
    bgDark: 'rgba(168, 85, 247, 0.15)',
    borderLight: 'rgba(124, 58, 237, 0.2)',
    borderDark: 'rgba(168, 85, 247, 0.3)'
  },
  system: { 
    label: 'SociusFit', 
    icon: '⚡', 
    colorLight: 'rgb(107, 114, 128)', 
    colorDark: 'rgb(156, 163, 175)',
    bgLight: 'rgba(107, 114, 128, 0.08)', 
    bgDark: 'rgba(156, 163, 175, 0.15)',
    borderLight: 'rgba(107, 114, 128, 0.2)',
    borderDark: 'rgba(156, 163, 175, 0.3)'
  },
}

// ============================================================
// COMPONENTS
// ============================================================
function ProfileMenu({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-blue-600 dark:bg-blue-500 text-white font-semibold flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
      >
        {user?.email?.[0]?.toUpperCase() || 'U'}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.email}</p>
            </div>
            <div className="py-1">
              <button
                onClick={() => { setIsOpen(false); router.push('/profile') }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Profile Settings
              </button>
              <button
                onClick={() => { setIsOpen(false); router.push('/dashboard') }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Dashboard
              </button>
              <button
                onClick={() => { setIsOpen(false); /* TODO: Open WHOOP settings */ }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                ⌚ WHOOP Connection
              </button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 py-1">
              <button
                onClick={() => { setIsOpen(false); onSignOut() }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function RecoveryBadge({ score }: { score: number }) {
  const color = score >= 67 ? '#16a34a' : score >= 34 ? '#ca8a04' : '#dc2626'
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: `${color}15` }}>
      <svg width="14" height="14" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6" fill="none" stroke={`${color}33`} strokeWidth="2.5" />
        <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(score / 100) * 37.7} 37.7`} strokeLinecap="round"
          transform="rotate(-90 8 8)" className="transition-all duration-1000" />
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  )
}

function TodaysProgram({ program }: { program: ProgramBlock[] | null }) {
  if (!program || program.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black rounded-xl p-4 text-white">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Today's Program</span>
      </div>
      <div className="space-y-3">
        {program.map((block, i) => (
          <div key={i}>
            <div className="text-sm font-semibold mb-1.5">{block.title}</div>
            {block.movements.map((movement, j) => (
              <div key={j} className="text-xs text-slate-300 pl-2 border-l-2 border-blue-500/30 mb-1">
                {movement}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroSummary({ consumed, target }: { consumed: Macros; target: Macros }) {
  const macros = [
    { label: 'Protein', current: consumed.protein, target: target.protein, color: '#2563eb' },
    { label: 'Carbs', current: consumed.carbs, target: target.carbs, color: '#16a34a' },
    { label: 'Fat', current: consumed.fat, target: target.fat, color: '#ca8a04' },
  ]

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex gap-4">
        {macros.map(macro => {
          const pct = Math.min(100, Math.round((macro.current / Math.max(1, macro.target)) * 100))
          return (
            <div key={macro.label} className="flex-1">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {macro.label}
                </span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                  {macro.current}<span className="text-gray-400 dark:text-gray-500">/{macro.target}g</span>
                </span>
              </div>
              <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: macro.color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChatMessage({ msg, isDark }: { msg: Message; isDark: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-4 animate-fadeUp">
        <div className="max-w-[85%] px-4 py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-2xl rounded-br-sm">
          <div className="text-sm leading-relaxed">{msg.content}</div>
          <div className="text-[10px] text-blue-100 dark:text-blue-200 mt-1 text-right">{msg.time}</div>
        </div>
      </div>
    )
  }

  const agent = AGENTS[msg.role] || AGENTS.system
  const agentColor = isDark ? agent.colorDark : agent.colorLight
  const agentBg = isDark ? agent.bgDark : agent.bgLight
  const agentBorder = isDark ? agent.borderDark : agent.borderLight

  return (
    <div className="mb-4 animate-fadeUp">
      <div className="flex items-center gap-2 mb-1.5 ml-0.5">
        <span className="text-sm">{agent.icon}</span>
        <span className="text-[11px] font-bold tracking-wide" style={{ color: agentColor }}>
          {agent.label}
        </span>
      </div>
      <div 
        className="max-w-[90%] px-4 py-2.5 rounded-2xl rounded-tl-sm border"
        style={{ 
          backgroundColor: agentBg,
          borderColor: agentBorder
        }}
      >
        <div className="text-sm leading-relaxed text-gray-900 dark:text-gray-100">{msg.content}</div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{msg.time}</div>
      </div>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function V2Page() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])
  const [recovery, setRecovery] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [program, setProgram] = useState<ProgramBlock[] | null>(null)
  const [macros, setMacros] = useState<{ consumed: Macros; target: Macros }>({
    consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    target: { protein: 180, carbs: 250, fat: 70, calories: 2350 }
  })
  const [isDark, setIsDark] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Detect system dark mode
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mediaQuery.matches)
    
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (user) {
      loadDashboardData()
      loadChatHistory()
      loadTodaysProgram()
    }
  }, [user])

  const loadDashboardData = async () => {
    try {
      // Load WHOOP recovery
      const whoopRes = await fetch('/api/whoop/data')
      if (whoopRes.ok) {
        const whoopData = await whoopRes.json()
        if (whoopData.recovery?.recovery_score) {
          setRecovery(whoopData.recovery.recovery_score)
        }
      }

      // Load today's nutrition
      const today = new Date().toISOString().split('T')[0]
      // Pass local timezone offset so the API queries the correct UTC window.
      // JS getTimezoneOffset() returns (UTC - local) in minutes, so negate it to get (local - UTC).
      const tzOffset = -new Date().getTimezoneOffset()
      const mealsRes = await fetch(`/api/meals/daily?date=${today}&tzOffset=${tzOffset}`)
      if (mealsRes.ok) {
        const mealsData = await mealsRes.json()
        setMacros(prev => ({
          ...prev,
          consumed: {
            protein:  Math.round(mealsData.dailyTotals?.protein  || 0),
            carbs:    Math.round(mealsData.dailyTotals?.carbs    || 0),
            fat:      Math.round(mealsData.dailyTotals?.fat      || 0),
            calories: Math.round(mealsData.dailyTotals?.calories || 0)
          }
        }))
      }

      // Load daily targets — API returns camelCase keys
      const targetsRes = await fetch(`/api/targets?date=${today}`)
      if (targetsRes.ok) {
        const targetsData = await targetsRes.json()
        if (targetsData.targetProtein) {
          setMacros(prev => ({
            ...prev,
            target: {
              protein:  targetsData.targetProtein,
              carbs:    targetsData.targetCarbs,
              fat:      targetsData.targetFat,
              calories: targetsData.targetCalories
            }
          }))
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
  }

  const loadChatHistory = async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('is_compacted', false)
        .order('created_at', { ascending: true })
        .limit(50)

      if (data && data.length > 0) {
        const loadedMessages: Message[] = data.map(row => ({
          id: row.id,
          role: row.domain || 'system',
          content: row.content,
          time: new Date(row.created_at).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          }).toLowerCase().replace(' ', '')
        }))
        setMessages(loadedMessages)
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
  }

  const loadTodaysProgram = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/workouts?date=${today}`)
      if (res.ok) {
        const data = await res.json()
        if (data.found && data.workout) {
          // Split workout text into display lines; each non-empty line becomes one program block
          const lines: string[] = data.workout.split('\n').filter((l: string) => l.trim())
          setProgram(lines.map((line: string) => ({ title: line, movements: [] })))
        }
      }
    } catch (error) {
      console.error('Error loading program:', error)
    }
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return

    const now = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    }).toLowerCase().replace(' ', '')
    
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: inputValue.trim(), 
      time: now 
    }
    
    setMessages(m => [...m, userMsg])
    setInputValue('')
    setIsTyping(true)

    try {
      const request: AgentRequest = {
        content: userMsg.content,
        input_mode: 'text',
        input_type: 'query'
      }

      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) throw new Error('Failed to process message')

      const data: AgentResponse = await response.json()
      
      const agentMessages: Message[] = data.messages.map(msg => ({
        id: String(Date.now() + Math.random()),
        role: msg.domain || 'system',
        content: msg.content,
        time: now
      }))

      setMessages(m => [...m, ...agentMessages])

      // Refresh dashboard data if meal or workout was logged
      if (data.messages.some(m => m.domain === 'nutritionist' || m.domain === 'trainer')) {
        setTimeout(loadDashboardData, 500)
      }
    } catch (error) {
      console.error('Error:', error)
      setMessages(m => [...m, {
        id: String(Date.now() + 1),
        role: 'system',
        content: 'Sorry, I encountered an error. Please try again.',
        time: now
      }])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/signin')
  }

  const handleVoiceStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' })
        await handleVoiceTranscription(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      setAudioChunks(chunks)
      setMediaRecorder(recorder)
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const handleVoiceStop = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      setIsRecording(false)
    }
  }

  const handleVoiceTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) throw new Error('Transcription failed')

      const data = await response.json()
      if (data.text) {
        setInputValue(data.text)
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
      alert('Failed to transcribe audio. Please try again.')
    }
  }

  const handlePhotoCapture = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsTyping(true)
    const now = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    }).toLowerCase().replace(' ', '')

    try {
      // Show user message with photo indicator
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: '📷 Uploaded photo',
        time: now
      }
      setMessages(m => [...m, userMsg])

      // Upload photo
      const formData = new FormData()
      formData.append('photo', file)

      const uploadResponse = await fetch('/api/meals/upload', {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) throw new Error('Photo upload failed')

      const uploadData = await uploadResponse.json()

      // Analyze with agent system
      const request: AgentRequest = {
        content: `Analyze this meal photo: ${uploadData.photo_url}`,
        input_mode: 'photo',
        input_type: 'meal_log',
        photo_url: uploadData.photo_url
      }

      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) throw new Error('Failed to process photo')

      const data: AgentResponse = await response.json()
      
      const agentMessages: Message[] = data.messages.map(msg => ({
        id: String(Date.now() + Math.random()),
        role: msg.domain || 'system',
        content: msg.content,
        time: now
      }))

      setMessages(m => [...m, ...agentMessages])
      setTimeout(loadDashboardData, 500)
    } catch (error) {
      console.error('Error processing photo:', error)
      setMessages(m => [...m, {
        id: String(Date.now() + 1),
        role: 'system',
        content: 'Sorry, I encountered an error processing the photo. Please try again.',
        time: now
      }])
    } finally {
      setIsTyping(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 transition-colors">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeUp {
          animation: fadeUp 0.3s ease;
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>

      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">SociusFit</h1>
        <div className="flex items-center gap-3">
          {recovery > 0 && <RecoveryBadge score={recovery} />}
          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Today's Program */}
          {program && <TodaysProgram program={program} />}

          {/* Macro Summary */}
          <MacroSummary consumed={macros.consumed} target={macros.target} />

          {/* Chat Feed */}
          <div className="space-y-2">
            {messages.map(msg => (
              <ChatMessage key={msg.id} msg={msg} isDark={isDark} />
            ))}

            {isTyping && (
              <div className="mb-4 animate-fadeUp">
                <div className="inline-flex gap-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
                      style={{ animation: `typingDot 1.2s ease infinite ${i * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>

      {/* INPUT BAR */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelected}
          className="hidden"
        />
        <div className="max-w-2xl mx-auto">
          {isRecording ? (
            <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">Recording...</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleVoiceStop}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-full transition-colors"
                >
                  Stop
                </button>
                <button
                  onClick={() => {
                    if (mediaRecorder) {
                      mediaRecorder.stop()
                      setIsRecording(false)
                    }
                  }}
                  className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <button
                onClick={handleVoiceStart}
                disabled={isTyping}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Voice input"
              >
                <span className="text-lg">🎤</span>
              </button>
              <button
                onClick={handlePhotoCapture}
                disabled={isTyping}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Photo input"
              >
                <span className="text-lg">📷</span>
              </button>
              <div className="flex-1 flex items-end bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-colors">
                <textarea
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Log a workout, meal, or ask anything..."
                  rows={1}
                  disabled={isTyping}
                  className="flex-1 bg-transparent px-4 py-3 text-sm resize-none outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 max-h-32 disabled:opacity-50"
                />
              </div>
              {inputValue.trim() && (
                <button
                  onClick={handleSend}
                  disabled={isTyping}
                  className="w-10 h-10 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all animate-fadeUp"
                >
                  <span className="text-lg">↑</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
