'use client'

import { useState } from 'react'

export default function TestAPI() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const testAPI = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    
    try {
      const response = await fetch('/api/fitness-insights?days=7')
      const data = await response.json()
      
      if (response.ok) {
        setResult(data)
      } else {
        setError(`API Error: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      setError(`Network Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🧪 Fitness Insights API Test</h1>
      
      <button
        onClick={testAPI}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-6"
      >
        {loading ? 'Testing...' : 'Test Fitness Insights API'}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="text-red-800 font-semibold">❌ Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-green-800 font-semibold mb-4">✅ API Response</h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-800">📊 Summary</h4>
              <div className="bg-white p-3 rounded border">
                <p>Workouts: {result.summary?.workoutCount || 0}</p>
                <p>Meals: {result.summary?.mealCount || 0}</p>
                <p>Total Protein: {result.summary?.totalProtein?.toFixed(1) || 0}g</p>
                <p>Total Calories: {result.summary?.totalCalories?.toFixed(0) || 0}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-800">💡 Insights ({result.insights?.length || 0})</h4>
              <div className="bg-white p-3 rounded border">
                {result.insights?.length > 0 ? (
                  result.insights.map((insight: any, index: number) => (
                    <div key={index} className="mb-3 p-2 bg-gray-50 rounded">
                      <h5 className="font-medium">{insight.title}</h5>
                      <p className="text-sm text-gray-600">{insight.description}</p>
                      <p className="text-xs text-gray-500">Confidence: {(insight.confidence * 100).toFixed(0)}%</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No insights generated (need more data)</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-800">🎯 Recommendations</h4>
              <div className="bg-white p-3 rounded border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h5 className="font-medium text-blue-600">Nutrition</h5>
                    <ul className="text-sm">
                      {result.recommendations?.nutrition?.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-600">• {rec}</li>
                      )) || <li className="text-gray-500">None</li>}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-green-600">Timing</h5>
                    <ul className="text-sm">
                      {result.recommendations?.timing?.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-600">• {rec}</li>
                      )) || <li className="text-gray-500">None</li>}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-purple-600">Workout</h5>
                    <ul className="text-sm">
                      {result.recommendations?.workout?.map((rec: string, i: number) => (
                        <li key={i} className="text-gray-600">• {rec}</li>
                      )) || <li className="text-gray-500">None</li>}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-gray-800">🔍 Raw JSON Response</summary>
              <pre className="bg-gray-100 p-3 rounded mt-2 text-xs overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}