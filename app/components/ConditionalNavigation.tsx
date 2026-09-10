'use client'

import React from 'react'
import Navigation from './Navigation'

export default function ConditionalNavigation({ children }: { children: React.ReactNode }) {
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
