'use client'

import { useState } from 'react'

export default function QueryWorkouts() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const quickQuestions = [
    "What's my best Fran time?",
    "What's my best Grace time?",
    "When did I last do back squat?",
    "When did I last do deadlift?",
  ]

  async function handleQuery(queryText: string) {
    setQuestion(queryText)
    setLoading(true)
    setError('')
    setAnswer('')

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText })
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
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Query Workouts</h1>

      <div className="mb-5">
        <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">⚡ Quick Questions</h2>
        <div className="grid grid-cols-1 gap-3">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleQuery(q)}
              disabled={loading}
              className="p-4 text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors active:scale-98 shadow-sm text-gray-900 dark:text-gray-100"
            >
              <span className="text-blue-600 dark:text-blue-400">🔍</span> {q}
            </button>
          ))}
        </div>
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
• What's my 1RM deadlift?
• How often do I do running workouts?
• Have I ever done Murph?"
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
          <p className="text-blue-700 dark:text-blue-300 font-medium">Analyzing your workout history...</p>
        </div>
      )}
    </div>
  )
}
