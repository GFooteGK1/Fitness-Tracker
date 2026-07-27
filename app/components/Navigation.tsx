'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth/AuthContext';
import UserMenu from './UserMenu';

export default function Navigation() {
  const { user, loading } = useAuth();

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
            SociusFit
          </Link>

          {/* Navigation Links */}
          {!loading && user && (
            <div className="hidden md:flex space-x-6">
              <Link 
                href="/dashboard" 
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Dashboard
              </Link>
              <Link 
                href="/program" 
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Program
              </Link>
              <Link
                href="/templates"
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Templates
              </Link>
              <Link
                href="/log"
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Log Workout
              </Link>
              <Link 
                href="/food-log" 
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Log Meal
              </Link>
              <Link 
                href="/food-progress" 
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Food Progress
              </Link>
              <Link
                href="/query"
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Query
              </Link>
              <Link
                href="/leaderboards"
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Leaderboards
              </Link>
              <Link
                href="/pr-history"
                className="text-gray-600 dark:text-gray-300 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
              >
                PRs
              </Link>
            </div>
          )}

          {/* User Menu - Only show when logged in */}
          <div className="flex items-center space-x-4">
            {loading ? (
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            ) : user ? (
              <UserMenu />
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {!loading && user && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700">
          <div
            role="group"
            aria-label="Mobile navigation"
            className="grid grid-cols-6 py-2"
          >
            <Link 
              href="/dashboard" 
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">📊</span>
              Dashboard
            </Link>
            <Link 
              href="/program" 
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">💪</span>
              Program
            </Link>
            <Link
              href="/templates"
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">📋</span>
              WODs
            </Link>
            <Link
              href="/log"
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">📝</span>
              Log
            </Link>
            <Link 
              href="/food-progress" 
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">🍽️</span>
              Food
            </Link>
            <Link
              href="/query"
              className="flex min-w-0 flex-col items-center overflow-hidden px-1 py-2 text-xs text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="text-lg mb-1">🔍</span>
              Query
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
