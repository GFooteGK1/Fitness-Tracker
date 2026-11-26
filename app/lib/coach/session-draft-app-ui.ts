import { mcpHostBridgeScript } from './activity-app-ui'
import { sociusCardStyles, sociusThemeStyles } from './socius-card-styles'

/** A read-only projection of the draft approved by the server's validation step. */
export const sessionDraftHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session draft | SociusFit</title>
  <style>
${sociusThemeStyles}
${sociusCardStyles}
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      color: var(--foreground);
      font: 1rem/1.55 system-ui, sans-serif;
      overflow-wrap: anywhere;
    }
    main { padding: .375rem; }
    main > .socius-card { margin: 0; }
    h1, h2, h3, p, ul, dl, dd { margin: 0; }
    h2 { font-size: 1.05rem; line-height: 1.35; }
    h3 { font-size: 1rem; line-height: 1.35; }
    #draft-label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .2rem .75rem; margin-bottom: .35rem; }
    #draft-label strong { color: var(--accent); }
    time, .muted { color: var(--muted); }
    .group { border-top: 1px solid var(--line); margin-top: 1rem; padding-top: 1rem; }
    #plan-basis, #history-note { margin-top: .5rem; }
    .phase ul { list-style: none; padding: 0; }
    .phase li { margin-top: .65rem; }
    .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .4rem .75rem; }
    .metrics div { min-width: 0; }
    dt { color: var(--muted); font-weight: 600; }
    .notes dt { margin-top: .5rem; }
    .group > summary { cursor: pointer; font-weight: 650; min-height: 44px; padding-block: .55rem; }
    .group > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    #edit-hint { margin-top: .75rem; }
  </style>
</head>
<body>
  <main>
    <p id="draft-status" class="socius-card muted" role="status">Loading session draft…</p>
    <details id="session-draft" class="socius-card" open hidden>
      <summary><h1 id="draft-title"></h1></summary>
      <div class="socius-card-body">
        <header>
          <p id="draft-label"><strong id="draft-kind">Session draft</strong><time id="draft-date"></time></p>
          <p id="draft-objective"></p>
          <p id="plan-basis" class="muted"></p>
          <p id="history-note" class="muted" hidden>Some saved workout evidence is unavailable.</p>
        </header>
        <section class="group" aria-labelledby="adjustment-title">
          <h2 id="adjustment-title">Today’s adjustment</h2>
          <p id="check-in-adjustment"></p>
        </section>
        <div id="session-phases"></div>
        <section class="group" aria-labelledby="scale-title">
          <h2 id="scale-title">When to scale or stop</h2>
          <dl class="notes">
            <dt>Scale when</dt><dd id="draft-scale"></dd>
            <dt>Stop when</dt><dd id="draft-stop"></dd>
          </dl>
        </section>
        <details class="group">
          <summary>Why this session</summary>
          <dl class="notes">
            <dt>Goal</dt><dd id="draft-goal"></dd>
            <dt>Four-week review</dt><dd id="draft-review"></dd>
            <dt>Rationale</dt><dd id="draft-rationale"></dd>
            <dt id="source-dates-label">Workout dates used</dt><dd id="source-dates"></dd>
          </dl>
        </details>
        <p id="edit-hint" class="muted">Ask in chat to adjust this draft.</p>
      </div>
    </details>
  </main>
  <script>
    (() => {
${mcpHostBridgeScript}
      const byId = id => document.getElementById(id);
      const card = byId('session-draft');
      const status = byId('draft-status');
      const phases = [['warmUp', 'Warm-up'], ['mainWork', 'Main work'], ['supportingWork', 'Supporting work'], ['cooldown', 'Cool-down']];
      const textFields = ['title', 'objective', 'goal', 'weekReview', 'checkInAdjustment', 'rationale', 'scaleWhen', 'stopWhen'];
      const rowFields = [['dose', 'Dose'], ['effort', 'Effort'], ['rest', 'Rest']];
      const planLabels = { follow: 'Based on the accepted session', adjust: 'Proposed adjustment to the accepted session', new: 'New session' };
      const dayLabels = { training: 'Session draft', recovery: 'Recovery draft', rest: 'Rest day draft' };
      const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      let waiting;
      let resizeObserver;
      let resultReceived = false;

      function showError() {
        card.hidden = true;
        status.hidden = false;
        status.textContent = 'Session draft is unavailable.';
      }

      function hasText(value) {
        return typeof value === 'string' && value.trim().length > 0;
      }

      function formatDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
        return formatter.format(new Date(value + 'T12:00:00Z'));
      }

      function addText(parent, name, text) {
        const element = document.createElement(name);
        element.textContent = text;
        parent.append(element);
        return element;
      }

      function renderDraft(draft) {
        const dayType = draft?.dayType ?? 'training';
        if (!draft || !textFields.every(key => hasText(draft[key])) || typeof draft.historyComplete !== 'boolean'
          || typeof draft.planUse !== 'string' || !Object.hasOwn(planLabels, draft.planUse)
          || !Object.hasOwn(dayLabels, dayType) || !Array.isArray(draft.sourceDates)
          || (dayType === 'rest' ? phases.some(([key]) => draft[key]?.length)
            : !draft.mainWork?.length || (dayType === 'training' && !draft.warmUp?.length))) {
          throw new Error('Draft missing');
        }
        const date = formatDate(draft.date);
        const dates = draft.sourceDates.map(formatDate);
        const sections = document.createDocumentFragment();
        for (const [key, label] of phases) {
          const entries = draft[key];
          if (!Array.isArray(entries)) throw new Error('Phase missing');
          if (!entries.length) continue;
          const section = document.createElement('section');
          section.className = 'phase group';
          addText(section, 'h2', label);
          const list = document.createElement('ul');
          for (const item of entries) {
            if (!item || !hasText(item.activity) || !rowFields.every(([key]) => hasText(item[key]))) throw new Error('Activity missing');
            const row = document.createElement('li');
            addText(row, 'h3', item.activity);
            const metrics = document.createElement('dl');
            metrics.className = 'metrics';
            for (const [key, label] of rowFields) {
              const group = document.createElement('div');
              addText(group, 'dt', label);
              addText(group, 'dd', item[key]);
              metrics.append(group);
            }
            row.append(metrics);
            list.append(row);
          }
          section.append(list);
          sections.append(section);
        }
        byId('draft-date').dateTime = draft.date;
        byId('draft-date').textContent = date;
        byId('draft-kind').textContent = dayLabels[dayType];
        byId('draft-title').textContent = draft.title;
        byId('draft-objective').textContent = draft.objective;
        byId('plan-basis').textContent = draft.daySchedule === 'scheduled_rest' ? 'Scheduled rest day'
          : dayType === 'rest' && draft.planUse === 'new' ? 'Rest recommended' : planLabels[draft.planUse];
        byId('check-in-adjustment').textContent = draft.checkInAdjustment;
        byId('scale-title').textContent = dayType === 'rest' ? 'When to reassess' : 'When to scale or stop';
        byId('draft-scale').textContent = draft.scaleWhen;
        byId('draft-stop').textContent = draft.stopWhen;
        byId('draft-goal').textContent = draft.goal;
        byId('draft-review').textContent = draft.weekReview;
        byId('draft-rationale').textContent = draft.rationale;
        byId('history-note').hidden = draft.historyComplete;
        byId('source-dates-label').hidden = dates.length === 0;
        byId('source-dates').hidden = dates.length === 0;
        byId('source-dates').textContent = dates.join(' · ');
        byId('session-phases').replaceChildren(sections);
        card.hidden = false;
        status.hidden = true;
      }

      const host = createMcpHostBridge({
        onToolResult(result) {
          resultReceived = true;
          clearTimeout(waiting);
          try {
            if (result?.isError) throw new Error('Tool call failed');
            renderDraft(result?._meta?.sessionDraft);
          } catch {
            showError();
          }
        },
        onClosed() {
          clearTimeout(waiting);
          resizeObserver?.disconnect();
          showError();
        },
      });
      if (window.parent === window) {
        showError();
      } else {
        void host.initialize('SociusFit session draft', 'inline').then(() => {
          if (host.closed) return;
          if (!resultReceived) waiting = setTimeout(showError, 15000);
          if (typeof ResizeObserver === 'function') {
            const main = document.querySelector('main');
            resizeObserver = new ResizeObserver(() => {
              const { width, height } = main.getBoundingClientRect();
              host.notify('ui/notifications/size-changed', { width: Math.ceil(width), height: Math.ceil(height) });
            });
            resizeObserver.observe(main);
          }
        }).catch(() => {
          if (!host.closed && !resultReceived) showError();
        });
      }
    })();
  </script>
</body>
</html>`
