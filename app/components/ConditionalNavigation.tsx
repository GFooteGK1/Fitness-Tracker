'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import Navigation from './Navigation'

export default function ConditionalNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  // The conversational experience owns its full-height layout and tab bar.
  const hideNavigation = pathname === '/coach' || pathname === '/v2'

  if (hideNavigation) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="app-content flex-1 px-4 pt-6 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
