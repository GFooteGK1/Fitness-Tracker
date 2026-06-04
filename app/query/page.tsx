'use client'

import { useState } from 'react'
import { getTimezoneOffset } from '@/app/lib/timezone-utils'

interface QuickQuestionCategory {
  title: string;
  icon: string;
  questions: string[];
}

export default function QueryWorkouts() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const toggleCategory = (title: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [title]: !prev[title]
    }))
  }

  const quickQuestionCategories: QuickQuestionCategory[] = [
    {
      title: 'Workout Questions',
      icon: '🏋️',
      questions: [
        "What's my best Fran time?",
        "What's my best Grace time?",
        "When did I last do back squat?",
        "When did I last do deadlift?",
      ]
    },
    {
      title: 'Nutrition Questions',
      icon: '🥗',
      questions: [
        "How much protein did I eat this week?",
        "What are my average daily calories?",
        "Am I hitting my macro targets?",
        "What did I eat yesterday?",
      ]
    },
    {
      title: 'Cross-Domain Insights',
      icon: '🔗',
      questions: [
        "How does my diet affect my workout performance?",
        "Do I eat more protein on training days?",
        "What's my nutrition like before heavy lifting days?",
        "How does my calorie intake correlate with workout intensity?",
      ]
    }
  ]

  async function handleQuery(queryText: string) {
    setQuestion(queryText)
    setLoading(true)
    setError('')
    setAnswer('')

    try {
      // Send timezone offset so server can properly interpret dates
      const tzOffset = getTimezoneOffset()
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText, tzOffset })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process query')
      }

      setAnswer(result.answer)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Ask About Your Fitness</h1>

      <div className="mb-5 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">⚡ Quick Questions</h2>
        {quickQuestionCategories.map((category) => {
          const isExpanded = expandedCategories[category.title] ?? false;
          return (
            <div key={category.title} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleCategory(category.title)}
                className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <span>{category.icon}</span> {category.title}
                </h3>
                <span className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 grid grid-cols-1 gap-2">
                  {category.questions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuery(q)}
                      disabled={loading}
                      className="p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors active:scale-98 shadow-sm text-gray-900 dark:text-gray-100"
                    >
                      <span className="text-blue-600 dark:text-blue-400">🔍</span> {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-5 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <label htmlFor="question" className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
          💬 Custom Question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Examples:
• When did I last do 5x5 back squat?
• How much protein did I eat this week?
• How does my diet affect my lifts?
• Am I eating enough on training days?"
          rows={5}
          className="w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        <button
          onClick={() => handleQuery(question)}
          disabled={loading || !question.trim()}
          className="mt-3 w-full bg-green-600 dark:bg-green-700 text-white px-6 py-4 text-base font-semibold rounded-xl hover:bg-green-700 dark:hover:bg-green-600 active:bg-green-800 dark:active:bg-green-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {loading ? '⏳ Searching...' : '🔍 Search'}
        </button>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-2 border-red-200 dark:border-red-800 rounded-xl text-sm font-medium">
          ❌ Error: {error}
        </div>
      )}

      {answer && (
        <div className="p-5 bg-white dark:bg-gray-800 border-l-4 border-green-500 dark:border-green-600 rounded-xl shadow-sm">
          <h3 className="font-bold text-green-700 dark:text-green-400 mb-3 text-sm">✓ Answer:</h3>
          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-base">
            {answer}
          </div>
        </div>
      )}

      {loading && (
        <div className="p-6 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-800 rounded-xl text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400 mb-3"></div>
          <p className="text-blue-700 dark:text-blue-300 font-medium">Analyzing your fitness data...</p>
        </div>
      )}
    </div>
  )
}
