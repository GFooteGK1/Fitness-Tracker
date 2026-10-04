/** Local qualification shell. Production components and HTTP handlers do the work. */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SupervisedWorkspace } from '@/app/program/supervised-workspace'
import { ReviewedProposalManager } from '@/app/program/reviewed-proposal-manager'
import { ReviewedSessionRunner } from '@/app/program/reviewed-session-runner'
import { ReviewedWeekView } from '@/app/program/reviewed-session-card'

function Harness() {
  const [state, setState] = useState<any>(null), [error, setError] = useState('')
  useEffect(() => { void fetch('/__test/state').then(async r => {
    if (!r.ok) throw Error('Local owned state unavailable')
    setState(await r.json())
  }).catch(e => setError(e.message)) }, [])
  const command = async (path: string, value: object) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
    if (!response.ok) { setError('Local test command failed. Inspect its retained receipt.'); return }
    location.assign('/program/supervised')
  }
  if (!state) return <p role="status">{error || 'Loading local qualification'}</p>
  if (!state.userId) return <main className="p-4"><h1>Local supervised qualification</h1>
    <p>Mechanical synthetic case. Global numerical policy is disabled.</p>
    {['athlete', 'reviewer', 'foreign'].map(actor => <button key={actor} className="block min-h-11 p-3"
      onClick={() => void command('/__test/login', { actor })}>Sign in synthetic {actor}</button>)}
    {error && <p role="alert">{error}</p>}
  </main>
  const session = location.pathname.match(/^\/program\/reviewed\/([a-f0-9-]+)$/)?.[1]
  return <><aside className="border-b p-3 text-base"><p>Local synthetic qualification · {state.actor}</p>
    <p>Global numerical policy disabled · isolated program {state.programId}</p>
    <a className="inline-block min-h-11 p-2 underline" href="/program/supervised">Supervised workspace</a>
    <a className="inline-block min-h-11 p-2 underline" href="/program">Accepted program</a>
    <button className="min-h-11 p-2 underline" onClick={() => void command('/__test/logout', {})}>Sign out test account</button>
    {error && <p role="alert">{error}</p>}</aside>
    {session ? <ReviewedSessionRunner key={`${state.userId}:${session}`} userId={state.userId} sessionId={session} />
      : location.pathname.startsWith('/program/reviewed/plans/') ? <ReviewedProposalManager userId={state.userId}
        programId={location.pathname.split('/').pop()!} />
        : location.pathname === '/program/supervised' ? <SupervisedWorkspace key={state.userId} userId={state.userId} />
          : <main className="mx-auto max-w-3xl p-4"><h1 className="text-2xl">Synthetic accepted program</h1>
            <a className="block min-h-11 underline" href={`/program/reviewed/plans/${state.programId}`}>Review athlete proposal</a>
            {state.plan ? <ReviewedWeekView value={state.plan} sessionLinks={state.sessionLinks} /> : <p>No owned accepted plan is visible.</p>}
          </main>}
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
