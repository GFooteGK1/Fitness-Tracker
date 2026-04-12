'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  validateTemplate,
  getWorkoutTypeLabel,
  type WorkoutType,
  type TemplateCategory,
  type Movement,
} from '../../lib/workout-templates';

const WORKOUT_TYPES: WorkoutType[] = ['amrap', 'emom', 'for_time', 'strength', 'custom'];
const CATEGORIES: TemplateCategory[] = ['benchmark', 'hero', 'strength', 'conditioning', 'gymnastics', 'custom'];

function emptyMovement(): Movement {
  return { name: '', reps: '', weight: '', distance: '', duration: '', notes: '' };
}

export default function CreateTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<WorkoutType>('for_time');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [movements, setMovements] = useState<Movement[]>([emptyMovement()]);
  const [timeCap, setTimeCap] = useState('');
  const [rounds, setRounds] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addMovement() {
    setMovements((prev) => [...prev, emptyMovement()]);
  }

  function removeMovement(index: number) {
    if (movements.length <= 1) return;
    setMovements((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMovement(index: number, field: keyof Movement, value: string) {
    setMovements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Clean movements - remove empty optional fields
    const cleanedMovements = movements.map((m) => {
      const cleaned: Movement = { name: m.name.trim() };
      if (m.reps) cleaned.reps = m.reps;
      if (m.weight) cleaned.weight = m.weight;
      if (m.distance) cleaned.distance = m.distance;
      if (m.duration) cleaned.duration = m.duration;
      if (m.notes) cleaned.notes = m.notes;
      return cleaned;
    });

    const templateData = {
      name: name.trim(),
      description: description.trim(),
      type,
      category,
      movements: cleanedMovements,
      timeCap: timeCap ? parseInt(timeCap, 10) : undefined,
      rounds: rounds ? parseInt(rounds, 10) : undefined,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    };

    const errors = validateTemplate(templateData);
    if (errors.length > 0) {
      setError(errors.join('. '));
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      const data = await res.json();
      router.push(`/templates/${data.template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link
          href="/templates"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          &larr; All Templates
        </Link>
      </div>

      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Create Template
      </h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Template Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Custom AMRAP"
            className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            style={{ fontSize: '16px' }}
            required
          />
        </div>

        {/* Description */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe the workout..."
            rows={2}
            className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Type & Category */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Workout Type *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WorkoutType)}
              className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              style={{ fontSize: '16px' }}
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {getWorkoutTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              style={{ fontSize: '16px' }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Cap & Rounds */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Time Cap (min)
            </label>
            <input
              type="number"
              value={timeCap}
              onChange={(e) => setTimeCap(e.target.value)}
              placeholder="e.g., 20"
              min="1"
              max="120"
              className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Rounds
            </label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
              placeholder="e.g., 5"
              min="1"
              max="100"
              className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>

        {/* Movements */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Movements *
            </label>
            <button
              type="button"
              onClick={addMovement}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Add Movement
            </button>
          </div>

          <div className="space-y-3">
            {movements.map((m, i) => (
              <div
                key={i}
                className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 w-5">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    placeholder="Movement name *"
                    value={m.name}
                    onChange={(e) => updateMovement(i, 'name', e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                    required
                  />
                  {movements.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMovement(i)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 ml-7">
                  <input
                    type="text"
                    placeholder="Reps (e.g., 21-15-9)"
                    value={m.reps || ''}
                    onChange={(e) => updateMovement(i, 'reps', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                  />
                  <input
                    type="text"
                    placeholder="Weight (e.g., 135 lb)"
                    value={m.weight || ''}
                    onChange={(e) => updateMovement(i, 'weight', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                  />
                  <input
                    type="text"
                    placeholder="Distance (e.g., 400m)"
                    value={m.distance || ''}
                    onChange={(e) => updateMovement(i, 'distance', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                  />
                  <input
                    type="text"
                    placeholder="Notes"
                    value={m.notes || ''}
                    onChange={(e) => updateMovement(i, 'notes', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    style={{ fontSize: '16px' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Tags
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="barbell, olympic lifting, fast (comma separated)"
            className="w-full px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            style={{ fontSize: '16px' }}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Separate with commas
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-900 -mx-4 px-4 py-3 sm:static sm:bg-transparent sm:dark:bg-transparent sm:mx-0 sm:px-0 sm:py-0 border-t sm:border-t-0 border-gray-200 dark:border-gray-800">
          <Link
            href="/templates"
            className="px-6 py-3 text-sm font-semibold border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 dark:bg-blue-700 text-white px-4 py-3 text-base font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </form>
    </div>
  );
}
