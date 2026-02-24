'use client'

import { usePathname } from 'next/navigation'
import Navigation from './Navigation'

export default function ConditionalNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  // Hide navigation on V2 page
  const hideNavigation = pathname === '/v2'

  if (hideNavigation) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 p-4 pb-20 md:pb-4">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
