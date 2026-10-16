/** Browser test shell; real production components, no fake API responses. */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ReviewedProposalManager } from '@/app/program/reviewed-proposal-manager'
import { ReviewedSessionRunner } from '@/app/program/reviewed-session-runner'
import { ReviewedWeekView } from '@/app/program/reviewed-session-card'

function Harness() {
  const [state, setState] = useState<any>(null), [error, setError] = useState('')
  const refresh = async () => {
    const response = await fetch('/__test/state'), value = await response.json()
    if (!response.ok) throw new Error(value.error ?? 'State unavailable')
    setState(value)
  }
  useEffect(() => { void refresh().catch(e => setError(e.message)) }, [])
  const command = async (path: string, body: object) => {
    setError('')
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) { setError('Local test operation failed'); return }
    location.assign('/program')
  }
  if (!state) return <p>{error || 'Loading local test'}</p>
  if (!state.userId) return <main className="p-4"><h1>Local synthetic browser test</h1>
    <button className="min-h-11 p-3" onClick={() => void command('/__test/login', { actor: 'athlete' })}>Sign in synthetic athlete</button>
    <button className="min-h-11 p-3" onClick={() => void command('/__test/login', { actor: 'foreign' })}>Sign in foreign test account</button>
  </main>
  const session = location.pathname.match(/^\/program\/reviewed\/([a-f0-9-]+)$/)?.[1]
  return <><aside className="border-b p-3 text-base"><p>Synthetic local test · {state.actor}</p>
    <button className="min-h-11 underline" onClick={() => void command('/__test/logout', {})}>Sign out test account</button>{error && <p role="alert">{error}</p>}</aside>
    {session ? <ReviewedSessionRunner key={`${state.userId}:${session}`} userId={state.userId} sessionId={session} />
      : location.pathname.includes('/reviewed/plans/') ? <ReviewedProposalManager key={`${state.userId}:${state.programId}`} userId={state.userId} programId={state.programId} />
        : <main className="mx-auto max-w-3xl p-4"><h1 className="text-2xl">Synthetic accepted program</h1>
          <a className="block min-h-11 underline" href={`/program/reviewed/plans/${state.programId}`}>Review proposed week</a>
          <button className="min-h-11 p-3" onClick={() => void command('/__test/review', { transition: 'same_week' })}>Load fixed same-week test review</button>
          <button className="min-h-11 p-3" onClick={() => void command('/__test/review', { transition: 'next_week' })}>Load fixed next-week test review</button>
          {state.plan && <ReviewedWeekView value={state.plan} sessionLinks={state.sessionLinks} />}
        </main>}
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
