'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface QuickMealButtonProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'floating' | 'inline'
}

export default function QuickMealButton({ 
  className = '', 
  size = 'md',
  variant = 'floating'
}: QuickMealButtonProps) {
  const pathname = usePathname()
  
  // Hide the floating button on food-progress page since it has its own navigation
  if (variant === 'floating' && pathname === '/food-progress') {
    return null
  }

  const sizeClasses = {
    sm: 'w-12 h-12 text-xl',
    md: 'w-14 h-14 text-2xl',
    lg: 'w-16 h-16 text-3xl'
  }

  const baseClasses = variant === 'floating' 
    ? `fixed bottom-20 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center ${sizeClasses[size]}`
    : `bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center ${sizeClasses[size]}`

  return (
    <Link
      href="/food-progress?view=camera"
      className={`${baseClasses} ${className}`}
      title="Quick meal capture"
    >
      <span className="flex items-center justify-center">
        📷
      </span>
    </Link>
  )
}