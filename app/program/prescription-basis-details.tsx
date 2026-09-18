import type { PrescriptionBasis } from '@/app/lib/coach/prescription-basis'

export function PrescriptionBasisDetails({ basis }: { basis?: PrescriptionBasis }) {
  if (!basis || basis.version !== 'prescription-basis-1' || !Array.isArray(basis.sourceIds) || typeof basis.statement !== 'string') return null
  return <details className="mt-4 rounded-xl border border-[var(--app-line)] p-3 text-sm">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold">What this plan is based on</summary>
    <p className="mt-2 text-[var(--app-muted)]">{basis.statement}</p>
    <p className="mt-2 text-[var(--app-muted)]">{basis.sourceIds.length} recorded sessions informed this review. Unlogged activity and outside training may be missing.</p>
  </details>
}
