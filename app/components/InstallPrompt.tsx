'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const dismissed = sessionStorage.getItem('pwa-install-dismissed')
    if (dismissed) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setDeferredPrompt(null)
    sessionStorage.setItem('pwa-install-dismissed', 'true')
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] md:bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-slide-up">
      <div className="app-panel shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[var(--accent-soft)] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              Install SociusFit
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Add to your home screen for quick access and offline support.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="app-icon-action shrink-0 -mt-1 -mr-1"
            aria-label="Dismiss install prompt"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="app-secondary flex-1 text-sm transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            className="app-primary flex-1 text-sm transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
