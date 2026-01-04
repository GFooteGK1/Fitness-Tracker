'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { FormErrors } from '@/app/lib/auth/types'

export default function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)
  
  const { signUp } = useAuth()
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
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      newErrors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }

    // Confirm password validation
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
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
      await signUp(email, password)
      
      // Check if email confirmation is needed
      setNeedsEmailConfirmation(true)
      
    } catch (error: any) {
      console.error('Sign up error:', error)
      
      // Handle specific error messages
      if (error.message?.includes('already registered')) {
        setErrors({ email: 'An account with this email already exists' })
      } else if (error.message?.includes('weak password')) {
        setErrors({ password: 'Password is too weak. Please choose a stronger password' })
      } else {
        setErrors({ general: error.message || 'An error occurred during sign up' })
      }
    } finally {
      setLoading(false)
    }
  }

  // Show email confirmation message
  if (needsEmailConfirmation) {
    return (
      <div className="text-center space-y-4">
        <div className="text-6xl mb-4">📧</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Check Your Email
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          We&apos;ve sent a confirmation link to <strong>{email}</strong>. 
          Please check your email and click the link to activate your account.
        </p>
        <div className="pt-4">
          <Link
            href="/auth/signin"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
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
        <label 
          htmlFor="password" 
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Password
        </label>
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
            placeholder="Create a strong password"
            disabled={loading}
            autoComplete="new-password"
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
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Must be at least 8 characters with uppercase, lowercase, and number
        </p>
      </div>

      {/* Confirm Password Field */}
      <div className="space-y-1">
        <label 
          htmlFor="confirmPassword" 
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base touch-target transition-colors ${
            errors.confirmPassword 
              ? 'border-red-300 dark:border-red-600' 
              : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Confirm your password"
          disabled={loading}
          autoComplete="new-password"
          required
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
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
        {loading ? 'Creating Account...' : 'Create Account'}
      </button>

      {/* Sign In Link */}
      <div className="text-center pt-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link 
            href="/auth/signin" 
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Sign In
          </Link>
        </p>
      </div>
    </form>
  )
}