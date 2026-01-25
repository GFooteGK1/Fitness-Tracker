'use client'

import { useEffect, useState } from 'react'

interface EnvVar {
  name: string
  value: string
  status: 'set' | 'missing'
}

export default function DebugEnvPage() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/env-check')
      .then(res => {
        if (!res.ok) throw new Error('Not available')
        return res.json()
      })
      .then(data => setEnvVars(data.vars))
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <h1 className="text-2xl font-bold text-red-500">Access Denied</h1>
        <p className="mt-2">This page is only available in development mode.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold text-blue-400 mb-4">🔧 Environment Variables</h1>
      <p className="text-gray-400 mb-6">Development mode only - blocked in production.</p>
      
      <table className="w-full max-w-3xl border-collapse">
        <thead>
          <tr className="bg-blue-600">
            <th className="border border-gray-600 p-3 text-left">Variable</th>
            <th className="border border-gray-600 p-3 text-left">Value</th>
            <th className="border border-gray-600 p-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {envVars.map((env, i) => (
            <tr key={env.name} className={i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850'}>
              <td className="border border-gray-600 p-3">
                <code className="bg-gray-700 px-2 py-1 rounded">{env.name}</code>
              </td>
              <td className="border border-gray-600 p-3">
                <code className="bg-gray-700 px-2 py-1 rounded">{env.value || '(not set)'}</code>
              </td>
              <td className={`border border-gray-600 p-3 ${env.status === 'set' ? 'text-green-400' : 'text-red-400'}`}>
                {env.status === 'set' ? '✓ Set' : '✗ Missing'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
