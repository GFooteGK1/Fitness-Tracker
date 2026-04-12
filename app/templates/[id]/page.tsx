'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  BUILT_IN_TEMPLATES,
  getWorkoutTypeLabel,
  getWorkoutTypeBadgeColor,
  getCategoryLabel,
  formatTemplateAsWorkoutText,
  estimateDuration,
  type WorkoutTemplate,
} from '../../lib/workout-templates';
import { createClient } from '../../lib/auth/supabase-client';

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [scaleWeights, setScaleWeights] = useState<Record<string, string>>({});
  const [showScalePanel, setShowScalePanel] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Find the template (built-in or custom)
  useEffect(() => {
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (builtIn) {
      setTemplate(builtIn);
      setLoading(false);
      fetchHistory(builtIn.name);
      return;
    }

    // Try fetching as custom template
    async function fetchCustom() {
      try {
        const res = await fetch('/api/templates');
        if (res.ok) {
          const data = await res.json();
          const custom = (data.templates || []).find(
            (t: WorkoutTemplate) => t.id === templateId
          );
          if (custom) {
            setTemplate(custom);
            fetchHistory(custom.name);
          }
        }
      } catch {
        // Template not found
      } finally {
        setLoading(false);
      }
    }

    fetchCustom();
  }, [templateId]);

  async function fetchHistory(templateName: string) {
    setLoadingHistory(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Search workouts that match this template name
      const { data } = await supabase
        .from('workouts')
        .select('id, date, raw_text, primary_score, tags, created_at')
        .eq('user_id', user.id)
        .or(`raw_text.ilike.%${templateName}%,tags.cs.{${templateName.toLowerCase()}}`)
        .order('date', { ascending: false })
        .limit(10);

      setHistory(data || []);
    } catch {
      // History unavailable
    } finally {
      setLoadingHistory(false);
    }
  }

  function handleLogWorkout() {
    if (!template) return;
    const text = formatTemplateAsWorkoutText(template, showScalePanel ? scaleWeights : undefined);
    const encoded = encodeURIComponent(text);
    router.push(`/log?workout=${encoded}`);
  }

  async function handleDeleteCustom() {
    if (!template?.isCustom) return;
    if (!confirm('Delete this custom template? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/templates?id=${template.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/templates');
      }
    } catch {
      alert('Failed to delete template');
    }
  }

  function handleScaleChange(movementName: string, value: string) {
    setScaleWeights((prev) => ({ ...prev, [movementName]: value }));
  }

  // Get the unique movements that have weights for scaling
  const weightedMovements = useMemo(() => {
    if (!template) return [];
    return template.movements.filter((m) => m.weight);
  }, [template]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400 dark:text-gray-500">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">Template not found</p>
        <Link
          href="/templates"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Back to templates
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/templates"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          &larr; All Templates
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {template.name}
          </h1>
          <div className="flex gap-1.5 flex-shrink-0">
            {template.isCustom && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                Custom
              </span>
            )}
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${getWorkoutTypeBadgeColor(
                template.type
              )}`}
            >
              {getWorkoutTypeLabel(template.type)}
            </span>
          </div>
        </div>

        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
            {getCategoryLabel(template.category)}
          </span>
          <span>{estimateDuration(template)}</span>
          {template.timeCap && <span>{template.timeCap} min cap</span>}
          {template.rounds && template.rounds > 1 && (
            <span>{template.rounds} rounds</span>
          )}
        </div>

        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Movements */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Movements
        </h2>
        <div className="space-y-3">
          {template.movements.map((m, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
            >
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {m.reps && (
                    <span className="text-blue-600 dark:text-blue-400 mr-1">
                      {m.reps}
                    </span>
                  )}
                  {m.name}
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {m.weight && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                      {showScalePanel && scaleWeights[m.name]
                        ? scaleWeights[m.name]
                        : m.weight}
                    </span>
                  )}
                  {m.distance && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                      {m.distance}
                    </span>
                  )}
                  {m.duration && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                      {m.duration}
                    </span>
                  )}
                  {m.notes && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                      {m.notes}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scale Panel */}
      {weightedMovements.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4">
          <button
            onClick={() => setShowScalePanel(!showScalePanel)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Scale Weights
            </h2>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {showScalePanel ? 'Use Rx' : 'Adjust'}
            </span>
          </button>

          {showScalePanel && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Adjust weights before logging. Leave blank to use Rx.
              </p>
              {weightedMovements.map((m) => (
                <div key={m.name} className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 dark:text-gray-300 w-40 flex-shrink-0 truncate">
                    {m.name}
                  </label>
                  <input
                    type="text"
                    placeholder={m.weight}
                    value={scaleWeights[m.name] || ''}
                    onChange={(e) => handleScaleChange(m.name, e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleLogWorkout}
          className="flex-1 bg-blue-600 dark:bg-blue-700 text-white px-4 py-3 text-base font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
        >
          Log This Workout
        </button>
        {template.isCustom && (
          <button
            onClick={handleDeleteCustom}
            className="px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        )}
      </div>

      {/* History */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Past Performances
        </h2>

        {loadingHistory ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            No previous performances found for this workout.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {new Date(entry.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  {entry.primary_score && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Score: {entry.primary_score}
                    </div>
                  )}
                </div>
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex gap-1">
                    {entry.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
