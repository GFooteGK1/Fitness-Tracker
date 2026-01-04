'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { FormErrors } from '@/app/lib/auth/types'

export default function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  
  const { signIn } = useAuth()
  const router = useRouter()

  // Validate form fields
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Email validation
    if (!email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Password validation
    if (!password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setErrors({})

    try {
      await signIn(email, password)
      
      // Redirect will be handled by the auth context
      router.push('/dashboard')
      
    } catch (error: any) {
      console.error('Sign in error:', error)
      
      // Handle specific error messages
      if (error.message?.includes('Invalid login credentials')) {
        setErrors({ general: 'Invalid email or password' })
      } else if (error.message?.includes('Email not confirmed')) {
        setErrors({ general: 'Please confirm your email address before signing in' })
      } else if (error.message?.includes('Too many requests')) {
        setErrors({ general: 'Too many failed attempts. Please try again later' })
      } else {
        setErrors({ general: error.message || 'An error occurred during sign in' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* General Error */}
      {errors.general && (
        <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{errors.general}</p>
        </div>
      )}

      {/* Email Field */}
      <div className="space-y-1">
        <label 
          htmlFor="email" 
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
            errors.email 
              ? 'border-red-300 dark:border-red-600' 
              : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="your@email.com"
          disabled={loading}
          autoComplete="email"
          required
        />
        {errors.email && (
          <p className="text-sm text-red-600 dark:text-red-400">{errors.email}</p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label 
            htmlFor="password" 
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <Link 
            href="/auth/reset-password" 
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
              errors.password 
                ? 'border-red-300 dark:border-red-600' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Enter your password"
            disabled={loading}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 touch-target"
            disabled={loading}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-red-600 dark:text-red-400">{errors.password}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 dark:bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium text-base touch-target disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {loading && (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
        )}
        {loading ? 'Signing In...' : 'Sign In'}
      </button>

      {/* Sign Up Link */}
      <div className="text-center pt-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link 
            href="/auth/signup" 
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </form>
  )
}