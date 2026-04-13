'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { type PRResult, formatPRValue } from '@/app/lib/pr-detection'

interface PRNotificationProps {
  prs: PRResult[]
  onDismiss: () => void
}

function ConfettiPiece({ index }: { index: number }) {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C00']
  const color = colors[index % colors.length]
  const left = Math.random() * 100
  const delay = Math.random() * 0.5
  const duration = 1.5 + Math.random() * 1.5
  const size = 6 + Math.random() * 6
  const rotation = Math.random() * 360

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${left}%`,
        top: '-10px',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        transform: `rotate(${rotation}deg)`,
        animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
        opacity: 0,
      }}
    />
  )
}

export default function PRNotification({ prs, onDismiss }: PRNotificationProps) {
  const [visible, setVisible] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (prs.length > 0) {
      // Small delay for entrance animation
      requestAnimationFrame(() => setVisible(true))
    }
  }, [prs.length])

  useEffect(() => {
    // Auto-dismiss after 5 seconds per PR
    const timer = setTimeout(() => {
      if (currentIndex < prs.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else {
        handleDismiss()
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [currentIndex, prs.length])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }, [onDismiss])

  if (prs.length === 0) return null

  const pr = prs[currentIndex]

  const prTypeLabel = {
    weight: 'New Max Weight',
    reps: 'New Rep Record',
    time: 'New Time Record',
    volume: 'New Volume Record',
  }

  const prTypeIcon = {
    weight: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h1m16 0h1M5.5 7.5h1v9h-1zm12 0h1v9h-1zM8 9h1v6H8zm7 0h1v6h-1zm-4 0h2v6h-2z" />
      </svg>
    ),
    reps: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    time: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    volume: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  }

  return (
    <>
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateY(400px) rotate(720deg);
          }
        }
        @keyframes pr-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes pr-shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleDismiss}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Confetti */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 50 }).map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </div>

        {/* PR Card */}
        <div
          className={`relative bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 rounded-2xl shadow-2xl p-1 max-w-sm w-full mx-4 transition-all duration-300 ${
            visible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'
          }`}
          style={{ animation: visible ? 'pr-pulse 2s ease-in-out infinite' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full mb-3 text-white">
                {prTypeIcon[pr.prType]}
              </div>
              <h2
                className="text-2xl font-black bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #D4A017, #FFD700, #D4A017, #FFD700)',
                  backgroundSize: '200% auto',
                  animation: 'pr-shine 3s linear infinite',
                }}
              >
                PERSONAL RECORD!
              </h2>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-1">
                {prTypeLabel[pr.prType]}
              </p>
            </div>

            {/* Exercise Name */}
            <div className="text-center mb-4">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{pr.exercise}</p>
            </div>

            {/* Old vs New */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Previous</p>
                <p className="text-lg font-bold text-gray-400 line-through">
                  {pr.previousBest > 0 ? formatPRValue(pr.prType, pr.previousBest) : '--'}
                </p>
              </div>
              <div className="text-2xl text-amber-500 font-bold">&rarr;</div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">New PR</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatPRValue(pr.prType, pr.newRecord)}
                </p>
              </div>
            </div>

            {/* Improvement */}
            <div className="text-center mb-4">
              <span className="inline-block bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-semibold px-3 py-1 rounded-full">
                {pr.improvement}
              </span>
            </div>

            {/* Multiple PRs indicator */}
            {prs.length > 1 && (
              <div className="flex justify-center gap-1.5 mb-3">
                {prs.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentIndex ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Dismiss hint */}
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              Tap to dismiss {prs.length > 1 ? `(${currentIndex + 1}/${prs.length})` : ''}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
