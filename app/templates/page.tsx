'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BUILT_IN_TEMPLATES,
  searchTemplates,
  filterTemplatesByCategory,
  getWorkoutTypeLabel,
  getWorkoutTypeBadgeColor,
  getCategoryLabel,
  formatMovementSummary,
  estimateDuration,
  type WorkoutTemplate,
  type TemplateCategory,
} from '../lib/workout-templates';

const CATEGORIES: (TemplateCategory | 'all')[] = [
  'all',
  'benchmark',
  'hero',
  'strength',
  'conditioning',
  'gymnastics',
  'custom',
];

export default function TemplatesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [customTemplates, setCustomTemplates] = useState<WorkoutTemplate[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);

  useEffect(() => {
    fetchCustomTemplates();
  }, []);

  async function fetchCustomTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setCustomTemplates(data.templates || []);
      }
    } catch {
      // Silently fail — built-in templates still work
    } finally {
      setLoadingCustom(false);
    }
  }

  const allTemplates = useMemo(() => {
    return [...BUILT_IN_TEMPLATES, ...customTemplates];
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    let result = allTemplates;
    result = filterTemplatesByCategory(result, activeCategory);
    result = searchTemplates(result, searchQuery);
    return result;
  }, [allTemplates, activeCategory, searchQuery]);

  return (
    <div className="pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          Workout Templates
        </h1>
        <Link
          href="/templates/create"
          className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
        >
          + Create Template
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, movement, or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* Category Tabs */}
      <div className="mb-6 overflow-x-auto -mx-4 px-4">
        <div className="flex gap-2 min-w-max pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white dark:bg-blue-700'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat === 'all' ? 'All' : getCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
        {searchQuery && ` matching "${searchQuery}"`}
      </p>

      {/* Template Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No templates found</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Try a different search or category
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => router.push(`/templates/${template.id}`)}
            />
          ))}
        </div>
      )}

      {loadingCustom && (
        <div className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Loading custom templates...
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onClick,
}: {
  template: WorkoutTemplate;
  onClick: () => void;
}) {
  const summary = formatMovementSummary(template);
  const duration = estimateDuration(template);

  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {template.name}
        </h3>
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

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
        {summary}
      </p>

      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span>{duration}</span>
        {template.timeCap && <span>{template.timeCap} min cap</span>}
        {template.rounds && template.rounds > 1 && <span>{template.rounds} rounds</span>}
      </div>
    </button>
  );
}
