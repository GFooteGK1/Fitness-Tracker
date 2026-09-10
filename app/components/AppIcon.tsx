import React from 'react'

const paths = {
  today: 'm3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
  plan: 'M5 5h14v16H5V5Zm3-3v6m8-6v6M5 10h14',
  plus: 'M12 5v14M5 12h14',
  progress: 'M4 20V10h4v10m4 0V4h4v16m4 0v-6M2 20h20',
  coach: 'M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0ZM7 11h10M7 15h6',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3V7Zm13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  microphone: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8',
  recent: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2',
  workout: 'M3 8v8m3-11v14m12-14v14m3-11v8M6 12h12',
  food: 'M5 3v7m3-7v7M3 3v5a3 3 0 0 0 6 0V3M6 11v10M19 3c-4 3-4 8 0 9v9m0-18v9',
} as const

export type AppIconName = keyof typeof paths

export function AppIcon({ name, className = 'h-6 w-6' }: { name: AppIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}
