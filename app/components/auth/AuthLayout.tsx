'use client'

import React from 'react'
import Link from 'next/link'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  showLogo?: boolean
}

export default function AuthLayout({ 
  children, 
  title, 
  subtitle,
  showLogo = true 
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Branding */}
        {showLogo && (
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-3 mb-4">
              <span className="text-4xl">🏋️</span>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                SociusFit
              </h1>
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your holistic fitness companion
            </p>
          </div>
        )}

        {/* Page Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h2>
          {subtitle && (
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {subtitle}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          {children}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <p>
            By continuing, you agree to our{' '}
            <Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}