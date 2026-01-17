'use client'

export default function DebugEnv() {
  const envVars = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    nodeEnv: process.env.NODE_ENV
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Environment Debug</h1>
      
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-2">Environment Variables</h2>
        <pre className="text-sm">
          {JSON.stringify(envVars, null, 2)}
        </pre>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-2">Browser Info</h2>
        <p>User Agent: {typeof window !== 'undefined' ? window.navigator.userAgent : 'Server'}</p>
        <p>URL: {typeof window !== 'undefined' ? window.location.href : 'Server'}</p>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
        <h2 className="font-semibold mb-2">Quick Tests</h2>
        <button 
          onClick={() => {
            console.log('Button clicked - React is working')
            alert('React is working!')
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded mr-2"
        >
          Test React
        </button>
        
        <button 
          onClick={async () => {
            try {
              const response = await fetch('/api/health')
              const data = await response.json()
              console.log('API Response:', data)
              alert(`API Response: ${JSON.stringify(data)}`)
            } catch (error) {
              console.error('API Error:', error)
              alert(`API Error: ${error.message}`)
            }
          }}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Test API
        </button>
      </div>
    </div>
  )
}