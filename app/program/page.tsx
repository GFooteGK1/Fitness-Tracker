'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import ProtectedRoute from '../components/auth/ProtectedRoute';

interface WorkoutData {
  workout: string | null;
  date: string;
  found: boolean;
  message?: string;
  availableDates?: {
    first: string;
    last: string;
    all: string[];
  };
}

export default function ProgramPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    // Get today's date in user's local timezone
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkout = async (date: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/workouts?date=${date}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch workout');
      }
      
      setWorkoutData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setWorkoutData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkout(selectedDate);
  }, [selectedDate]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            💪 Daily Program
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View your coach's daily workout programming from Google Sheets
          </p>
        </div>

        {/* Date Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <label htmlFor="program-date" className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            📅 Program Date
          </label>
          <input
            type="date"
            id="program-date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="block w-full px-3 py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
            style={{
              minHeight: '48px',
              fontSize: '16px',
              colorScheme: 'light dark',
              maxWidth: '100%',
              margin: '0',
              WebkitAppearance: 'none',
              appearance: 'none'
            }}
          />
        </div>

        {/* Workout Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Loading workout...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 dark:text-red-400 mb-2">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Error Loading Workout
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              <button
                onClick={() => fetchWorkout(selectedDate)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : workoutData?.found && workoutData.workout ? (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Workout for {formatDate(selectedDate)}
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
                {workoutData.workout}
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <a
                  href={`/log?workout=${encodeURIComponent(workoutData.workout)}`}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
                >
                  📝 Log This Workout
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(workoutData.workout || '');
                    // You could add a toast notification here
                  }}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-center font-medium"
                >
                  📋 Copy Workout
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Workout Found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {workoutData?.message || `No workout scheduled for ${formatDate(selectedDate)}`}
              </p>
              
              {workoutData?.availableDates && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <p>Available dates: {workoutData.availableDates.first} to {workoutData.availableDates.last}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}