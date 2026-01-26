'use client';

import { useState, useEffect } from 'react';
import type { WhoopRecovery, WhoopSleep, WhoopCycle } from '@/app/lib/types/whoop';

interface WhoopMetricsCardProps {
  className?: string;
}

interface WhoopData {
  recovery: WhoopRecovery | null;
  sleep: WhoopSleep | null;
  cycle: WhoopCycle | null;
  connectionStatus: 'connected' | 'disconnected' | 'unhealthy';
  lastSyncAt: string | null;
  staleness: boolean;
}

export function WhoopMetricsCard({ className = '' }: WhoopMetricsCardProps) {
  const [data, setData] = useState<WhoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWhoopData();
  }, []);

  // Auto-sync if data is stale (>4 hours old)
  useEffect(() => {
    if (!data || !data.lastSyncAt) return;

    const lastSync = new Date(data.lastSyncAt);
    const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);

    // If data is more than 4 hours old, trigger background sync
    if (hoursSinceSync > 4) {
      console.log('[WHOOP] Data is stale, triggering background sync');
      
      // Trigger sync in background (don't wait for it)
      fetch('/api/whoop/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: false })
      })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            console.log('[WHOOP] Background sync completed:', result.recordsSynced);
            // Refresh data after sync
            setTimeout(() => fetchWhoopData(), 2000);
          }
        })
        .catch(err => {
          console.error('[WHOOP] Background sync failed:', err);
        });
    }
  }, [data]);

  const fetchWhoopData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/whoop/data?type=all');
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to view WHOOP data');
        }
        throw new Error('Failed to fetch WHOOP data');
      }

      const whoopData = await response.json();
      setData(whoopData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/whoop/auth';
  };

  // Loading state
  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">⚡ WHOOP Metrics</h2>
          <div className="w-6 h-6 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="space-y-3">
          <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">⚡ WHOOP Metrics</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!data || data.connectionStatus === 'disconnected') {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">⚡ WHOOP Metrics</h2>
        <div className="text-center py-8">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Connect Your WHOOP</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Track recovery, strain, and sleep metrics alongside your workouts and nutrition
          </p>
          <button
            onClick={handleConnect}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Connect WHOOP
          </button>
        </div>
      </div>
    );
  }

  // Unhealthy connection state
  if (data.connectionStatus === 'unhealthy') {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">⚡ WHOOP Metrics</h2>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Connection Issue</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                Unable to sync with WHOOP. Please reconnect your account.
              </p>
              <button
                onClick={handleConnect}
                className="mt-3 text-sm font-medium text-yellow-800 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-200"
              >
                Reconnect →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper function to get recovery color classes
  const getRecoveryColorClasses = (score: number | null | undefined): { border: string; text: string; bg: string } => {
    if (score === null || score === undefined) {
      return { border: 'border-l-gray-300 dark:border-l-gray-600', text: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/20' };
    }
    if (score >= 67) {
      return { border: 'border-l-green-500', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' };
    }
    if (score >= 34) {
      return { border: 'border-l-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' };
    }
    return { border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' };
  };

  const recoveryScore = data.recovery?.recovery_score;
  const recoveryColors = getRecoveryColorClasses(recoveryScore);
  const sleepPerformance = data.sleep?.sleep_performance_percentage;
  const strain = data.cycle?.strain;

  // Format last sync time
  const formatLastSync = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">⚡ WHOOP Metrics</h2>
        {data.staleness && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded border border-yellow-200 dark:border-yellow-800">
            Stale data
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Recovery Score */}
        <div className={`border-l-4 ${recoveryColors.border} pl-4 py-2`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recovery</p>
              {recoveryScore !== null && recoveryScore !== undefined ? (
                <p className={`text-2xl font-bold ${recoveryColors.text}`}>
                  {recoveryScore}%
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>
            {data.recovery?.hrv_rmssd_milli && (
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">HRV</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {Math.round(data.recovery.hrv_rmssd_milli)} ms
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sleep Performance */}
        <div className="border-l-4 border-l-blue-500 pl-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sleep</p>
              {sleepPerformance !== null && sleepPerformance !== undefined ? (
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {sleepPerformance}%
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>
            {data.sleep?.sleep_efficiency_percentage && (
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Efficiency</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {Math.round(data.sleep.sleep_efficiency_percentage)}%
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Strain */}
        <div className="border-l-4 border-l-purple-500 pl-4 py-2">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Strain</p>
            {strain !== null && strain !== undefined ? (
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {strain.toFixed(1)}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Last sync info */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Last synced: {formatLastSync(data.lastSyncAt)}
        </p>
      </div>
    </div>
  );
}
