/**
 * Session management utilities for handling authentication session expiry
 * Implements Requirements 10.5 - handle authentication session expiry
 */

import React from 'react'

export interface SessionInfo {
  isValid: boolean
  expiresAt?: number
  userId?: string
  refreshToken?: string
}

export interface SessionCallbacks {
  onSessionExpired?: () => void
  onSessionRefreshed?: (newSession: SessionInfo) => void
  onSessionError?: (error: string) => void
}

const SESSION_STORAGE_KEY = 'food_tracking_session'
const SESSION_CHECK_INTERVAL = 60000 // 1 minute
const REFRESH_THRESHOLD = 300000 // 5 minutes before expiry

class SessionManager {
  private session: SessionInfo | null = null
  private checkInterval: NodeJS.Timeout | null = null
  private callbacks: SessionCallbacks = {}
  private isRefreshing = false

  constructor() {
    this.loadSession()
    this.startSessionCheck()
  }

  /**
   * Initialize session with user data
   */
  initSession(sessionData: {
    userId: string
    accessToken: string
    refreshToken?: string
    expiresIn: number // seconds
  }): void {
    const expiresAt = Date.now() + (sessionData.expiresIn * 1000)
    
    this.session = {
      isValid: true,
      expiresAt,
      userId: sessionData.userId,
      refreshToken: sessionData.refreshToken
    }

    this.saveSession()
    console.log('Session initialized, expires at:', new Date(expiresAt))
  }

  /**
   * Get current session info
   */
  getSession(): SessionInfo | null {
    if (!this.session) {
      return null
    }

    // Check if session is expired
    if (this.session.expiresAt && Date.now() >= this.session.expiresAt) {
      this.session.isValid = false
      this.saveSession()
      this.callbacks.onSessionExpired?.()
    }

    return this.session
  }

  /**
   * Check if session is valid and not expired
   */
  isSessionValid(): boolean {
    const session = this.getSession()
    return session?.isValid === true
  }

  /**
   * Check if session needs refresh (within threshold of expiry)
   */
  needsRefresh(): boolean {
    if (!this.session?.expiresAt) {
      return false
    }

    const timeUntilExpiry = this.session.expiresAt - Date.now()
    return timeUntilExpiry <= REFRESH_THRESHOLD && timeUntilExpiry > 0
  }

  /**
   * Attempt to refresh the session
   */
  async refreshSession(): Promise<boolean> {
    if (this.isRefreshing || !this.session?.refreshToken) {
      return false
    }

    this.isRefreshing = true

    try {
      console.log('Attempting to refresh session...')

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: this.session.refreshToken
        })
      })

      if (!response.ok) {
        throw new Error('Session refresh failed')
      }

      const data = await response.json()
      
      // Update session with new tokens
      this.initSession({
        userId: this.session.userId!,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || this.session.refreshToken,
        expiresIn: data.expiresIn
      })

      console.log('Session refreshed successfully')
      this.callbacks.onSessionRefreshed?.(this.session!)
      return true

    } catch (error) {
      console.error('Session refresh failed:', error)
      this.invalidateSession()
      this.callbacks.onSessionError?.(error instanceof Error ? error.message : 'Session refresh failed')
      return false
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * Invalidate current session
   */
  invalidateSession(): void {
    this.session = { isValid: false }
    this.saveSession()
    console.log('Session invalidated')
  }

  /**
   * Clear session data
   */
  clearSession(): void {
    this.session = null
    this.clearStoredSession()
    console.log('Session cleared')
  }

  /**
   * Set session event callbacks
   */
  setCallbacks(callbacks: SessionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Add authorization header to fetch requests
   */
  async authorizedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Check if session needs refresh
    if (this.needsRefresh()) {
      await this.refreshSession()
    }

    // Check if session is still valid
    if (!this.isSessionValid()) {
      throw new Error('Session expired')
    }

    // Add authorization header
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${this.getAccessToken()}`)

    const response = await fetch(url, {
      ...options,
      headers
    })

    // Handle 401 responses by attempting refresh
    if (response.status === 401 && !this.isRefreshing) {
      const refreshed = await this.refreshSession()
      if (refreshed) {
        // Retry request with new token
        headers.set('Authorization', `Bearer ${this.getAccessToken()}`)
        return fetch(url, {
          ...options,
          headers
        })
      }
    }

    return response
  }

  /**
   * Get access token from session
   */
  private getAccessToken(): string | null {
    // In a real implementation, this would return the actual access token
    // For now, we'll use a placeholder since the current implementation
    // doesn't store the actual token (only session metadata)
    return this.session?.userId ? 'placeholder_token' : null
  }

  private loadSession(): void {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY)
      if (stored) {
        this.session = JSON.parse(stored)
        console.log('Session loaded from storage')
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      this.session = null
    }
  }

  private saveSession(): void {
    try {
      if (this.session) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session))
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  private clearStoredSession(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear stored session:', error)
    }
  }

  private startSessionCheck(): void {
    this.checkInterval = setInterval(() => {
      if (this.session && this.needsRefresh()) {
        console.log('Session needs refresh, attempting automatic refresh...')
        this.refreshSession()
      }
    }, SESSION_CHECK_INTERVAL)
  }

  /**
   * Cleanup method for component unmounting
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager()

/**
 * React hook for session management
 */
export function useSession() {
  const [session, setSession] = React.useState<SessionInfo | null>(sessionManager.getSession())
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  React.useEffect(() => {
    // Set up session callbacks
    sessionManager.setCallbacks({
      onSessionExpired: () => {
        setSession({ isValid: false })
        console.log('Session expired')
      },
      onSessionRefreshed: (newSession) => {
        setSession(newSession)
        setIsRefreshing(false)
        console.log('Session refreshed')
      },
      onSessionError: (error) => {
        setSession({ isValid: false })
        setIsRefreshing(false)
        console.error('Session error:', error)
      }
    })

    // Check session status periodically
    const interval = setInterval(() => {
      const currentSession = sessionManager.getSession()
      setSession(currentSession)
      
      if (sessionManager.needsRefresh() && !isRefreshing) {
        setIsRefreshing(true)
      }
    }, 30000) // Check every 30 seconds

    return () => {
      clearInterval(interval)
    }
  }, [isRefreshing])

  return {
    session,
    isValid: session?.isValid === true,
    isRefreshing,
    refreshSession: () => {
      setIsRefreshing(true)
      return sessionManager.refreshSession()
    },
    clearSession: () => {
      sessionManager.clearSession()
      setSession(null)
    },
    authorizedFetch: sessionManager.authorizedFetch.bind(sessionManager)
  }
}

/**
 * Higher-order component for protecting routes that require authentication
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function AuthenticatedComponent(props: P) {
    const { isValid } = useSession()

    if (!isValid) {
      return React.createElement('div', 
        { className: 'flex items-center justify-center min-h-screen' },
        React.createElement('div',
          { className: 'text-center' },
          React.createElement('h2', 
            { className: 'text-xl font-semibold text-gray-900 mb-2' },
            'Session Expired'
          ),
          React.createElement('p',
            { className: 'text-gray-600 mb-4' },
            'Please sign in again to continue.'
          ),
          React.createElement('button',
            { 
              onClick: () => window.location.href = '/login',
              className: 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg'
            },
            'Sign In'
          )
        )
      )
    }

    return React.createElement(Component, props)
  }
}