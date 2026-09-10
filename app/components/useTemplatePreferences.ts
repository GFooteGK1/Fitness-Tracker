'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'

interface TemplatePreferences {
  favorites: string[]
  recent: string[]
  weights: Record<string, Record<string, string>>
}
const empty = (): TemplatePreferences => ({ favorites: [], recent: [], weights: {} })
export function useTemplatePreferences() {
  const { user } = useAuth()
  const key = user?.id ? `sociusfit:templates:${user.id}` : null
  const [state, setState] = useState<{ key: string | null; value: TemplatePreferences }>({ key: null, value: empty() })
  useEffect(() => {
    let value = empty()
    try {
      const stored = key && localStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored)
        value = {
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id: unknown) => typeof id === 'string') : [],
          recent: Array.isArray(parsed.recent) ? parsed.recent.filter((id: unknown) => typeof id === 'string').slice(0, 6) : [],
          weights: parsed.weights && typeof parsed.weights === 'object' && !Array.isArray(parsed.weights) ? Object.fromEntries(Object.entries(parsed.weights).filter(([, weights]) => weights && typeof weights === 'object' && !Array.isArray(weights)).map(([id, weights]) => [id, Object.fromEntries(Object.entries(weights as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))])) : {},
        }
      }
    } catch { /* Preferences are optional when storage is unavailable. */ }
    setState({ key, value })
  }, [key])
  const preferences = state.key === key ? state.value : empty()
  const update = (next: TemplatePreferences) => {
    if (!key) return
    setState({ key, value: next })
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep the current session usable. */ }
  }
  return {
    ...preferences,
    toggleFavorite: (id: string) => update({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter(value => value !== id) : [...preferences.favorites, id] }),
    rememberDraft: (id: string, weights: Record<string, string>) => update({ ...preferences, recent: [id, ...preferences.recent.filter(value => value !== id)].slice(0, 6), weights: { ...preferences.weights, [id]: weights } }),
  }
}
