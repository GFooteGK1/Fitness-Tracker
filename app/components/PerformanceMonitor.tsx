'use client'

import { useEffect } from 'react'

interface PerformanceMonitorProps {
  pageName: string
}

/**
 * Performance monitoring component that tracks page load times
 * and reports performance metrics for optimization
 */
export default function PerformanceMonitor({ pageName }: PerformanceMonitorProps) {
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Track page load performance
    const trackPerformance = () => {
      try {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        
        if (navigation) {
          const metrics = {
            page: pageName,
            loadTime: navigation.loadEventEnd - navigation.loadEventStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            firstContentfulPaint: 0,
            largestContentfulPaint: 0,
            cumulativeLayoutShift: 0,
            firstInputDelay: 0
          }

          // Get Web Vitals if available
          if ('PerformanceObserver' in window) {
            // First Contentful Paint
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (entry.name === 'first-contentful-paint') {
                  metrics.firstContentfulPaint = entry.startTime
                }
              }
            }).observe({ entryTypes: ['paint'] })

            // Largest Contentful Paint
            new PerformanceObserver((list) => {
              const entries = list.getEntries()
              const lastEntry = entries[entries.length - 1]
              metrics.largestContentfulPaint = lastEntry.startTime
            }).observe({ entryTypes: ['largest-contentful-paint'] })

            // Cumulative Layout Shift
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!(entry as any).hadRecentInput) {
                  metrics.cumulativeLayoutShift += (entry as any).value
                }
              }
            }).observe({ entryTypes: ['layout-shift'] })
          }

          // Log performance metrics (in production, send to analytics)
          if (process.env.NODE_ENV === 'development') {
            console.group(`🚀 Performance Metrics - ${pageName}`)
            console.log('Load Time:', metrics.loadTime.toFixed(2), 'ms')
            console.log('DOM Content Loaded:', metrics.domContentLoaded.toFixed(2), 'ms')
            console.log('First Contentful Paint:', metrics.firstContentfulPaint.toFixed(2), 'ms')
            console.log('Largest Contentful Paint:', metrics.largestContentfulPaint.toFixed(2), 'ms')
            console.log('Cumulative Layout Shift:', metrics.cumulativeLayoutShift.toFixed(4))
            console.groupEnd()

            // Performance warnings
            if (metrics.loadTime > 3000) {
              console.warn(`⚠️ Slow page load detected: ${metrics.loadTime.toFixed(2)}ms`)
            }
            if (metrics.largestContentfulPaint > 2500) {
              console.warn(`⚠️ Poor LCP detected: ${metrics.largestContentfulPaint.toFixed(2)}ms`)
            }
            if (metrics.cumulativeLayoutShift > 0.1) {
              console.warn(`⚠️ High CLS detected: ${metrics.cumulativeLayoutShift.toFixed(4)}`)
            }
          }

          // In production, you would send these metrics to your analytics service
          // Example: analytics.track('page_performance', metrics)
        }
      } catch (error) {
        console.error('Performance monitoring error:', error)
      }
    }

    // Track performance after page is fully loaded
    if (document.readyState === 'complete') {
      trackPerformance()
    } else {
      window.addEventListener('load', trackPerformance)
      return () => window.removeEventListener('load', trackPerformance)
    }
  }, [pageName])

  // This component doesn't render anything
  return null
}

/**
 * Hook to measure component render performance
 */
export function useRenderPerformance(componentName: string) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const startTime = performance.now()
      
      return () => {
        const endTime = performance.now()
        const renderTime = endTime - startTime
        
        if (renderTime > 16) { // More than one frame (60fps)
          console.warn(`🐌 Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`)
        }
      }
    }
  })
}