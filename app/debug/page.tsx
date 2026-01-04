'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'

export default function DebugPage() {
  const { user, profile, loading, session } = useAuth()
  const [apiTests, setApiTests] = useState<Record<string, any>>({})
  const [envCheck, setEnvCheck] = useState<Record<string, any>>({})

  useEffect(() => {
    runDiagnostics()
  }, [])

  async function runDiagnostics() {
    console.log('🔍 Running diagnostics...')
    
    // Test environment variables (client-side)
    const env = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      supabaseKeyPreview: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...',
      nodeEnv: process.env.NODE_ENV,
      // Debug: show actual values (be careful in production)
      actualSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      actualSupabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'
    }
    console.log('Environment check:', env)
    setEnvCheck(env)

    // Test API endpoints
    const tests: Record<string, any> = {}

    try {
      // Health check
      const healthResponse = await fetch('/api/health')
      tests.health = {
        status: healthResponse.status,
        ok: healthResponse.ok,
        data: healthResponse.ok ? await healthResponse.json() : await healthResponse.text()
      }
    } catch (error) {
      tests.health = { error: error instanceof Error ? error.message : 'Unknown error' }
    }

    try {
      // Profile endpoint
      const profileResponse = await fetch('/api/profile')
      tests.profile = {
        status: profileResponse.status,
        ok: profileResponse.ok,
        data: profileResponse.ok ? await profileResponse.json() : await profileResponse.text()
      }
    } catch (error) {
      tests.profile = { error: error instanceof Error ? error.message : 'Unknown error' }
    }

    try {
      // Dashboard stats
      const statsResponse = await fetch('/api/dashboard-stats')
      tests.dashboardStats = {
        status: statsResponse.status,
        ok: statsResponse.ok,
        data: statsResponse.ok ? await statsResponse.json() : await statsResponse.text()
      }
    } catch (error) {
      tests.dashboardStats = { error: error instanceof Error ? error.message : 'Unknown error' }
    }

    try {
      // Auth test
      const authResponse = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'test' })
      })
      tests.auth = {
        status: authResponse.status,
        ok: authResponse.ok,
        data: authResponse.ok ? await authResponse.json() : await authResponse.text()
      }
    } catch (error) {
      tests.auth = { error: error instanceof Error ? error.message : 'Unknown error' }
    }

    setApiTests(tests)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
          🔍 SociusFit Debug Dashboard
        </h1>

        {/* Authentication State */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Authentication State
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <strong>Loading:</strong> {loading ? '✅ Yes' : '❌ No'}
            </div>
            <div>
              <strong>User:</strong> {user ? '✅ Authenticated' : '❌ Not authenticated'}
            </div>
            <div>
              <strong>Session:</strong> {session ? '✅ Active' : '❌ None'}
            </div>
            <div>
              <strong>Profile:</strong> {profile ? '✅ Loaded' : '❌ Not loaded'}
            </div>
          </div>
          
          {user && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
              <strong>User Details:</strong>
              <pre className="text-sm mt-2 overflow-auto">
                {JSON.stringify({ 
                  id: user.id, 
                  email: user.email,
                  created_at: user.created_at 
                }, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Environment Check */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Environment Configuration
          </h2>
          <div className="space-y-2">
            <div>
              <strong>Supabase URL:</strong> {envCheck.hasSupabaseUrl ? '✅ Set' : '❌ Missing'}
              {envCheck.supabaseUrl && <span className="ml-2 text-sm text-gray-600">({envCheck.supabaseUrl})</span>}
            </div>
            <div>
              <strong>Supabase Key:</strong> {envCheck.hasSupabaseKey ? '✅ Set' : '❌ Missing'}
              {envCheck.supabaseKeyPreview && <span className="ml-2 text-sm text-gray-600">({envCheck.supabaseKeyPreview})</span>}
            </div>
            <div>
              <strong>Node Environment:</strong> {envCheck.nodeEnv || 'Unknown'}
            </div>
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm">
              <strong>Debug Info:</strong>
              <div>Actual URL: {envCheck.actualSupabaseUrl || 'Not found'}</div>
              <div>Actual Key: {envCheck.actualSupabaseKey || 'Not found'}</div>
            </div>
          </div>
        </div>

        {/* API Tests */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            API Endpoint Tests
          </h2>
          <div className="space-y-4">
            {Object.entries(apiTests).map(([endpoint, result]) => (
              <div key={endpoint} className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {endpoint}
                </h3>
                <div className="text-sm space-y-1">
                  {result.error ? (
                    <div className="text-red-600 dark:text-red-400">
                      ❌ Error: {result.error}
                    </div>
                  ) : (
                    <>
                      <div>
                        Status: <span className={result.ok ? 'text-green-600' : 'text-red-600'}>
                          {result.status} {result.ok ? '✅' : '❌'}
                        </span>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                          Show Response
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto">
                          {typeof result.data === 'string' 
                            ? result.data.substring(0, 500) + (result.data.length > 500 ? '...' : '')
                            : JSON.stringify(result.data, null, 2)
                          }
                        </pre>
                      </details>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            Actions
          </h2>
          <div className="space-x-4">
            <button
              onClick={runDiagnostics}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              🔄 Refresh Diagnostics
            </button>
            <a
              href="/auth/signin"
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors inline-block"
            >
              🔑 Go to Sign In
            </a>
            <a
              href="/dashboard"
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors inline-block"
            >
              📊 Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}