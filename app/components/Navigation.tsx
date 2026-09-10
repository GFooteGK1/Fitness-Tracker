'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../lib/auth/AuthContext'
import UserMenu from './UserMenu'
import { AppIcon, type AppIconName } from './AppIcon'

const destinations: { href: string; label: string; icon: AppIconName }[] = [
  { href: '/dashboard', label: 'Today', icon: 'today' },
  { href: '/program', label: 'Plan', icon: 'plan' },
  { href: '/capture', label: 'Log', icon: 'plus' },
  { href: '/progress', label: 'Progress', icon: 'progress' },
  { href: '/coach', label: 'Coach', icon: 'coach' },
]

export default function Navigation() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const active = (href: string) => pathname === href
    || (href === '/progress' && ['/food-progress', '/pr-history', '/leaderboards'].some(route => pathname.startsWith(route)))
    || (href === '/program' && pathname.startsWith('/templates'))
    || (href === '/capture' && ['/log', '/food-log'].includes(pathname))

  return <>
    <header className="app-header">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
        <Link href={user ? '/dashboard' : '/'} className="flex min-h-11 items-center text-xl font-semibold tracking-tight">SociusFit<span className="ml-1 text-[var(--accent)]">.</span></Link>
        {!loading && user && <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {destinations.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined} className="app-desktop-link">{item.label}</Link>)}
        </nav>}
        {loading ? <div role="status" aria-label="Loading account" className="h-10 w-10 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" /> : user ? <UserMenu /> : null}
      </div>
    </header>
    {!loading && user && <nav aria-label="Mobile navigation" className="app-bottom-nav md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {destinations.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined} className="app-tab">
          <span className={item.icon === 'plus' ? 'app-log-icon' : ''}><AppIcon name={item.icon} /></span>
          <span>{item.label}</span>
        </Link>)}
      </div>
    </nav>}
  </>
}
