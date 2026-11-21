import { activityCardMarkup, activityRendererScript, activityStyles, mcpHostBridgeScript } from './activity-app-ui'
import { nutritionCardMarkup, nutritionRendererScript, nutritionStyles } from './nutrition-app-ui'

/** A self-contained MCP Apps resource. Athlete data arrives only through the host's tool bridge. */
export const sociusTodayHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Today | SociusFit</title>
  <style>
    :root {
      color-scheme: light dark;
      --background: light-dark(#f4f5f2, #14191d);
      --surface: light-dark(#ffffff, #20272b);
      --foreground: light-dark(#202824, #f1f4f2);
      --muted: light-dark(#58665f, #aab8b1);
      --line: light-dark(#dce2dd, #364047);
      --accent: light-dark(#216b55, #84dbc2);
      --action-text: light-dark(#ffffff, #10231c);
      --accent-soft: light-dark(#e8f1ec, #243c34);
      --warning: light-dark(#805000, #f1cd79);
      --warning-soft: light-dark(#fff4d6, #383022);
      --danger: light-dark(#a52b32, #ffadb2);
      --danger-soft: light-dark(#fff0f0, #3c272d);
    }
    :root[data-theme="light"] { color-scheme: light; }
    :root[data-theme="dark"] { color-scheme: dark; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--foreground);
      font: 1rem/1.55 system-ui, sans-serif;
    }
    main {
      max-width: 62rem;
      margin: auto;
      padding: max(1.25rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
        max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      overflow-wrap: anywhere;
    }
    header { margin: .5rem 0 1.25rem; }
    .brand {
      margin: 0 0 .45rem;
      color: var(--accent);
      font-weight: 700;
    }
    h1, h2, h3, p { margin: 0; }
    h1 {
      font-size: clamp(2.4rem, 8vw, 4rem);
      line-height: 1.05;
      letter-spacing: -.06em;
    }
    h2 { font-size: 1.15rem; letter-spacing: -.02em; }
    h3 { font-size: 1.05rem; line-height: 1.35; }
    #today-date { display: block; margin-top: .45rem; }
    .muted, time, dd { color: var(--muted); }
    .panel {
      --panel-padding: clamp(1rem, 3vw, 1.5rem);
      min-width: 0;
      margin-bottom: 1rem;
      padding: var(--panel-padding);
      border: 1px solid var(--line);
      border-radius: 1.1rem;
      background: var(--surface);
    }
    .session-panel {
      border-top: .25rem solid var(--accent);
    }
    .section-note, .status-label { margin-top: .45rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    .entry {
      margin-top: .8rem;
      padding-top: .8rem;
      border-top: 1px solid var(--line);
    }
    .entry > p, .entry > time { display: block; margin-top: .22rem; }
    .entry-heading { display: flex; flex-wrap: wrap; gap: .35rem .65rem; align-items: baseline; }
    .entry-state { color: var(--accent); font-weight: 600; }
    .metrics { display: grid; gap: .2rem; margin-top: .35rem; }
    .metrics li { color: var(--foreground); }
    .recovery-state {
      display: inline-block;
      margin-top: .6rem;
      padding: .16rem .55rem;
      border-radius: .45rem;
      color: var(--muted);
    }
    .recovery-state[data-state="stale"], .recovery-state[data-state="unverified"] {
      color: var(--warning);
      background: var(--warning-soft);
    }
    .whoop-gauges {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .4rem;
      margin-top: 1rem;
    }
    .whoop-gauge {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0;
      text-align: center;
      --gauge-color: var(--accent);
    }
    .whoop-gauge.sleep { --gauge-color: light-dark(#2a6397, #89c0f4); }
    .whoop-gauge.strain { --gauge-color: light-dark(#66509d, #c7a9f8); }
    .whoop-gauge[data-zone="moderate"] { --gauge-color: var(--warning); }
    .whoop-gauge[data-zone="low"] { --gauge-color: var(--danger); }
    .whoop-dial {
      display: grid;
      order: -1;
      width: min(100%, 5.25rem);
      aspect-ratio: 1;
      place-items: center;
      border-radius: 50%;
      background: conic-gradient(from 202deg, var(--gauge-color) var(--gauge-angle, 0deg), var(--line) 0 316deg, transparent 0);
      color: var(--foreground);
      font-variant-numeric: tabular-nums;
    }
    .whoop-dial strong {
      display: grid;
      width: calc(100% - .65rem);
      aspect-ratio: 1;
      place-items: center;
      border-radius: 50%;
      background: var(--surface);
      font-size: clamp(1rem, 4.5vw, 1.35rem);
      line-height: 1;
    }
    .whoop-gauge dt { margin-top: .15rem; }
    .whoop-gauge-note { display: block; color: var(--warning); font-weight: 400; font-size: .85rem; }
    .whoop-gauge-alternative {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .recovery-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 7.75rem), 1fr));
      gap: .45rem;
      margin-top: .85rem;
    }
    .recovery-metrics > div {
      min-width: 0;
      margin: 0;
      padding: .6rem .65rem;
      border: 1px solid var(--line);
      border-radius: .6rem;
    }
    .recovery-metrics dd, .workout-recovery dd {
      color: var(--foreground);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .recovery-metrics dt { color: var(--muted); }
    .workout-recovery { margin-top: .9rem; padding-top: .8rem; border-top: 1px solid var(--line); }
    .workout-recovery > p { margin-top: .35rem; }
    .workout-recovery dd time { display: block; font-weight: 400; }
    .recovery-timing { margin-top: .7rem; }
    .recovery-timing > summary {
      min-height: 44px;
      padding-block: .55rem;
      cursor: pointer;
    }
    .recovery-timing > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    dl { margin: .55rem 0 0; }
    dl > div { margin-top: .5rem; }
    dt { font-weight: 600; }
    dd { margin: 0; }
    button {
      min-width: 44px;
      min-height: 44px;
      padding: .65rem .95rem;
      border: 1px solid transparent;
      border-radius: .7rem;
      background: var(--accent);
      color: var(--action-text);
      cursor: pointer;
      font: inherit;
      font-weight: 650;
      touch-action: manipulation;
    }
    button:hover:not(:disabled) { text-decoration: underline; }
    button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    button:disabled { opacity: .7; cursor: wait; }
    #retry { margin-top: .65rem; }
    #check-in-form { margin-top: 1rem; }
    .check-in-fields { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
    .check-in-fields legend { padding: 0; font-weight: 650; }
    .check-in-grid { display: grid; gap: .6rem; margin-block: .65rem .8rem; }
    .check-in-grid label { display: grid; gap: .2rem; font-weight: 600; }
    .check-in-grid select {
      width: 100%;
      min-height: 44px;
      padding: .5rem .6rem;
      border: 1px solid var(--line);
      border-radius: .6rem;
      background: var(--surface);
      color: var(--foreground);
      font: inherit;
      font-weight: 400;
    }
    .check-in-grid select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    #check-in-status:not(:empty) { margin-top: .55rem; }
    #check-in-status[data-error] { color: var(--danger); }
    #recommendation-title {
      margin-top: .45rem;
      font-size: clamp(1.6rem, 6vw, 2.25rem);
      line-height: 1.15;
      letter-spacing: -.035em;
    }
    .bullets { list-style: disc; padding-inline-start: 1.2rem; }
    .guidance-list { margin-block: .35rem 0; padding-inline-start: 1.2rem; }
    .guidance-heading { margin: .8rem 0 0; font-size: 1rem; }
    .guidance-list li + li { margin-top: .25rem; }
    #saved-review {
      margin-top: .8rem;
      padding: .75rem;
      border-inline-start: .25rem solid var(--warning);
      border-radius: .45rem;
      background: var(--warning-soft);
    }
    #accepted-plan-details { margin-top: .75rem; }
    .workout-panel { padding: 0; }
    .workout-panel > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .6rem;
      min-height: 44px;
      padding: var(--panel-padding);
      border-radius: inherit;
      cursor: pointer;
      list-style: none;
    }
    .workout-panel > summary::-webkit-details-marker { display: none; }
    .workout-panel > summary::after {
      content: '';
      flex: 0 0 .55rem;
      height: .55rem;
      margin-inline-end: .2rem;
      border: solid var(--accent);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .workout-panel[open] > summary::after { transform: rotate(225deg); }
    .workout-panel > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    .workout-content { padding: 0 var(--panel-padding) var(--panel-padding); }
    #workout-date { margin-top: .45rem; }
    .workout-phase { margin-top: 1rem; }
    .workout-phase h4 { margin: 0; font-size: 1rem; }
    .secondary-action { color: var(--accent); border-color: var(--line); background: var(--surface); }
    #nutrition-refresh, #nutrition-retry, #nutrition-load:not(:empty) { margin-top: .65rem; }
    #load-error { color: var(--danger); background: var(--danger-soft); }
    footer { color: var(--muted); }
    @media (min-width: 42rem) {
      main { padding-inline: 1.75rem; padding-block: 2rem; }
      .check-in-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
${activityStyles}
${nutritionStyles}
  </style>
</head>
<body>
  <main>
    <header>
      <p class="brand">SociusFit</p>
      <h1 id="view-title">Today</h1>
      <time id="today-date" hidden></time>
      <nav id="view-switch" class="view-switch" aria-label="SociusFit views" hidden>
        <button id="show-today" type="button" aria-pressed="true" aria-controls="today-content">Today</button>
        <button id="show-activity" type="button" aria-pressed="false" aria-controls="activity-content" hidden>Activity</button>
        <button id="show-nutrition" type="button" aria-pressed="false" aria-controls="nutrition-content" hidden>Nutrition</button>
      </nav>
    </header>
    <p id="loading" class="muted" role="status">Loading your saved training…</p>
    <section id="load-error" class="panel" hidden>
      <p id="error-message" role="alert"></p>
      <button id="retry" type="button">Try again</button>
    </section>
    <div id="today-content" hidden>
      <section class="panel session-panel" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Recommended plan</h2>
        <div id="recommendation-result" hidden>
          <h3 id="recommendation-title" tabindex="-1"></h3>
          <p id="recommendation-summary" class="section-note"></p>
          <h4 class="guidance-heading">What to do</h4>
          <ol id="recommendation-actions" class="guidance-list"></ol>
          <h4 class="guidance-heading">What informed this</h4>
          <ul id="recommendation-reasons" class="bullets guidance-list"></ul>
          <p class="muted section-note">Use this as a starting point and adjust it to how you feel.</p>
        </div>
        <div id="saved-review" hidden>
          <h3 id="saved-review-title"></h3>
          <p id="saved-review-reason" class="section-note" hidden></p>
        </div>
        <form id="check-in-form" autocomplete="off">
          <fieldset id="check-in-fields" class="check-in-fields" aria-describedby="check-in-instructions">
            <legend>How do you feel today?</legend>
            <p id="check-in-instructions" class="muted">Compare each with your usual.</p>
            <div class="check-in-grid">
              <label>Stress
                <select id="check-in-stress" required>
                  <option value="" selected disabled>Choose one</option>
                  <option value="lower">Lower than usual</option>
                  <option value="usual">Usual</option>
                  <option value="higher">Higher than usual</option>
                </select>
              </label>
              <label>Fatigue
                <select id="check-in-fatigue" required>
                  <option value="" selected disabled>Choose one</option>
                  <option value="lower">Lower than usual</option>
                  <option value="usual">Usual</option>
                  <option value="higher">Higher than usual</option>
                </select>
              </label>
              <label>Sleep
                <select id="check-in-sleep" required>
                  <option value="" selected disabled>Choose one</option>
                  <option value="worse">Worse than usual</option>
                  <option value="usual">Usual</option>
                  <option value="better">Better than usual</option>
                </select>
              </label>
            </div>
          </fieldset>
          <button id="check-in-submit" type="submit">Get recommendation</button>
          <p id="check-in-status" role="status" class="muted"></p>
        </form>
        <details id="accepted-plan-details" class="recovery-timing" hidden>
          <summary id="accepted-plan-summary">Accepted plan for today</summary>
          <h3 id="saved-guidance-title" class="section-note" hidden></h3>
          <p id="saved-guidance-reason" class="muted section-note" hidden></p>
          <ul id="sessions"></ul>
        </details>
      </section>
      <section id="whoop-panel" class="panel" aria-labelledby="recovery-title">
        <h2 id="recovery-title">WHOOP</h2>
        <p id="recovery-status" class="recovery-state"></p>
        <p id="whoop-refresh-status" class="muted" role="status" hidden></p>
        <p id="recovery-note" class="muted status-label" hidden></p>
        <dl id="whoop-gauges" class="whoop-gauges">
          <div class="whoop-gauge sleep">
            <dt>Sleep<span id="sleep-note" class="whoop-gauge-note" hidden>Earlier saved date</span></dt>
            <dd class="whoop-dial"><strong id="sleep-score-value"></strong><span class="whoop-gauge-alternative" hidden>Unavailable</span></dd>
          </div>
          <div id="recovery-overview" class="whoop-gauge">
            <dt>Recovery<span id="recovery-score-note" class="whoop-gauge-note" hidden>Earlier saved date</span></dt>
            <dd class="whoop-dial"><strong id="recovery-percent"></strong><span class="whoop-gauge-alternative" hidden>Unavailable</span></dd>
          </div>
          <div class="whoop-gauge strain">
            <dt>Strain<span id="strain-note" class="whoop-gauge-note" hidden>Earlier saved date</span></dt>
            <dd class="whoop-dial"><strong id="strain-score-value"></strong><span class="whoop-gauge-alternative" hidden>Unavailable</span></dd>
          </div>
        </dl>
        <details id="whoop-details" class="recovery-timing" hidden>
          <summary>WHOOP details</summary>
          <dl id="recovery-metrics" class="recovery-metrics" hidden></dl>
          <dl id="recovery-dates"></dl>
          <section id="workout-recovery" class="workout-recovery" aria-labelledby="workout-recovery-title" hidden>
            <h3 id="workout-recovery-title">Last workout comparison</h3>
            <p id="workout-recovery-note" class="muted" hidden></p>
            <dl id="workout-recovery-metrics" hidden></dl>
          </section>
        </details>
      </section>
      <details id="last-workout" class="panel workout-panel">
        <summary><h2 id="recent-title">Last workout logged</h2></summary>
        <div class="workout-content">
          <time id="workout-date" hidden></time>
          <p id="workout-rpe" class="muted section-note" hidden></p>
          <p id="recent-note" class="muted section-note" hidden></p>
          <section id="workout-warmup" class="workout-phase" aria-labelledby="workout-warmup-title" hidden>
            <h3 id="workout-warmup-title">Warm-up</h3>
            <ul id="recent-warmup"></ul>
          </section>
          <section id="workout-main" class="workout-phase" aria-labelledby="workout-main-title" hidden>
            <h3 id="workout-main-title">Main work</h3>
            <ul id="recent"></ul>
          </section>
        </div>
      </details>
      <footer>Read from SociusFit <time id="read-at"></time></footer>
    </div>
    <section id="activity-content" class="panel" aria-labelledby="view-title" hidden>
      <div class="activity-date-controls">
        <label class="activity-date-field" for="activity-date">Date
          <input id="activity-date" type="date" min="0001-01-01" required>
        </label>
        <button id="previous-day" type="button">Previous day</button>
        <button id="next-day" type="button">Next day</button>
      </div>
      <p id="activity-load" class="muted" role="status"></p>
      <button id="activity-retry" type="button" hidden>Try again</button>
${activityCardMarkup}
    </section>
    <section id="nutrition-content" class="panel" aria-labelledby="view-title" hidden>
      <p id="nutrition-load" class="muted" role="status"></p>
      <button id="nutrition-retry" type="button" hidden>Try again</button>
${nutritionCardMarkup}
      <button id="nutrition-refresh" class="secondary-action" type="button" hidden>Refresh totals</button>
    </section>
  </main>
  <script>
    (() => {
      const byId = id => document.getElementById(id);
${activityRendererScript}
${nutritionRendererScript}
${mcpHostBridgeScript}
      const host = createMcpHostBridge({ onClosed: stopRefreshTimers });
      const activityDate = byId('activity-date');
      const checkInForm = byId('check-in-form');
      const checkInSubmit = byId('check-in-submit');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let initialized = false;
      let activityRequest = 0;
      let activeView = 'today';
      let nutritionRefresh = null;
      let nutritionInFlight = false;
      let nutritionSignInRequired = false;
      let savedRecommendation = null;
      let dayTimer = null;
      let deviceDay = localDayKey(new Date());
      let dayRevision = 0;
      let todayReadRevision = 0;
      let whoopRefreshInFlight = false;
      let lastWhoopReadAt = null;
      const whoopRefreshIntervalMs = 30_000;

      function element(tag, text, className) {
        const node = document.createElement(tag);
        if (typeof text === 'string') node.textContent = text;
        if (className) node.className = className;
        return node;
      }

      function setNote(id, message) {
        const target = byId(id);
        target.textContent = message || '';
        target.hidden = !message;
      }

      function setTime(node, value, dateOnly) {
        if (typeof value !== 'string') return false;
        const date = new Date(dateOnly ? value + 'T12:00:00Z' : value);
        if (!Number.isFinite(date.getTime())) return false;
        const options = dateOnly
          ? { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }
          : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
        node.dateTime = value;
        node.textContent = new Intl.DateTimeFormat(undefined, options).format(date);
        return true;
      }

      function renderAcceptedPlan(today) {
        const sessions = today.workoutRecommendation?.sessions ?? today.sessions;
        const statusLabels = { planned: 'Planned', completed: 'Completed', skipped: 'Skipped' };
        savedRecommendation = today.workoutRecommendation?.source === 'saved_recommendation' ? today.workoutRecommendation : null;
        byId('sessions').replaceChildren(...sessions.map(session => {
          const item = element('li', null, 'entry');
          const heading = element('div', null, 'entry-heading');
          heading.append(element('h3', session.title || 'Training session'));
          if (statusLabels[session.status]) {
            heading.append(element('span', statusLabels[session.status], 'entry-state'));
          }
          item.append(heading);
          if (session.focus) item.append(element('p', session.focus, 'muted'));
          if (session.details?.length) {
            const details = element('ul', null, 'metrics bullets');
            details.append(...session.details.map(value => element('li', value)));
            item.append(details);
          }
          return item;
        }));
        renderSavedGuidance(null);
      }

      function renderSavedGuidance(guidance) {
        const savedTitle = savedRecommendation?.title;
        const sameTitle = !!guidance && guidance.title.trim().toLowerCase() === savedTitle?.trim().toLowerCase();
        const showReview = !!savedRecommendation?.reviewBeforeTraining && !!savedTitle && !sameTitle;
        const showInDetails = !!savedTitle && !sameTitle && !showReview;
        byId('saved-review').hidden = !showReview;
        setNote('saved-review-title', showReview ? savedTitle : null);
        setNote('saved-review-reason', showReview ? savedRecommendation.reason : null);
        setNote('saved-guidance-title', showInDetails ? savedTitle : null);
        setNote('saved-guidance-reason', showInDetails ? savedRecommendation.reason : null);
        byId('accepted-plan-summary').textContent = showInDetails ? 'Saved plan and guidance' : 'Accepted plan for today';
        byId('accepted-plan-details').hidden = !showInDetails && !byId('sessions').childElementCount;
      }

      function setCheckInStatus(text, isError = false) {
        const status = byId('check-in-status');
        status.textContent = text;
        status.toggleAttribute('data-error', isError);
      }

      function renderGuidance(guidance) {
        const result = byId('recommendation-result');
        result.hidden = !guidance;
        byId('recommendation-title').textContent = guidance?.title ?? '';
        byId('recommendation-summary').textContent = guidance?.summary ?? '';
        byId('recommendation-reasons').replaceChildren(...(guidance?.reasons ?? []).map(reason => element('li', reason)));
        byId('recommendation-actions').replaceChildren(...(guidance?.actions ?? []).map(action => element('li', action)));
        renderSavedGuidance(guidance);
      }

      function renderLastWorkout(workout) {
        const labels = {
          partial: 'Some saved workout details are unavailable.',
          empty: 'No completed workout is saved in the available history.',
          unavailable: 'The last completed workout is currently unavailable.',
        };
        setNote('recent-note', workout?.timing === 'same_day_order_unknown'
          ? 'Several workouts were saved that day. Their workout order could not be verified.'
          : labels[workout?.status ?? 'unavailable']);
        const date = byId('workout-date');
        date.hidden = !setTime(date, workout?.date, true);
        setNote('workout-rpe', Number.isFinite(workout?.sessionRpe) ? 'Session RPE ' + workout.sessionRpe + ' / 10' : null);
        const renderMovement = work => {
          const item = element('li', null, 'entry');
          item.append(element('h4', work.name));
          if (work.measurements.length) {
            const metrics = element('ul', null, 'metrics');
            metrics.append(...work.measurements.map(value => element('li', value)));
            item.append(metrics);
          }
          return item;
        };
        const movements = workout?.movements ?? [];
        const warmup = movements.filter(work => work.phase === 'warmup');
        const main = movements.filter(work => work.phase !== 'warmup');
        byId('recent-warmup').replaceChildren(...warmup.map(renderMovement));
        byId('recent').replaceChildren(...main.map(renderMovement));
        byId('workout-warmup').hidden = !warmup.length;
        byId('workout-main').hidden = !main.length;
      }

      function renderRecovery(recovery) {
        const labels = {
          stale: 'Stale',
          unverified: 'Freshness unverified',
          unavailable: 'Unavailable',
          disconnected: 'WHOOP disconnected',
          saved: 'Saved WHOOP data',
          fresh: 'Current',
        };
        const state = byId('recovery-status');
        state.textContent = labels[recovery.status] || 'Unavailable';
        state.dataset.state = recovery.status;
        setNote('recovery-note', recovery.status === 'stale' ? 'Recovery data may be out of date.'
          : recovery.status === 'unverified' ? 'The timestamp or sync could not be verified.' : null);
        function addMetric(list, label, detail) {
          const row = element('div');
          const value = element('dd');
          value.append(detail);
          row.append(element('dt', label), value);
          list.append(row);
          return value;
        }
        function isScore(value, max) {
          return Number.isFinite(value) && value >= 0 && value <= max;
        }
        function setGauge(id, value, max, format) {
          const node = byId(id);
          const available = isScore(value, max);
          node.textContent = available ? format(value) : '—';
          node.setAttribute('aria-hidden', String(!available));
          node.nextElementSibling.hidden = available;
          node.parentElement.style.setProperty('--gauge-angle', (available ? value / max * 316 : 0) + 'deg');
        }
        const percent = value => value + '%';
        setGauge('sleep-score-value', recovery.sleepPerformance, 100, percent);
        setGauge('recovery-percent', recovery.recoveryScore, 100, percent);
        setGauge('strain-score-value', recovery.strainScore, 21, value => value.toFixed(1));
        byId('sleep-note').hidden = recovery.sleepScoreStatus !== 'stale' || !isScore(recovery.sleepPerformance, 100);
        byId('recovery-score-note').hidden = recovery.recoveryScoreStatus !== 'stale' || !isScore(recovery.recoveryScore, 100);
        byId('strain-note').hidden = recovery.strainStatus !== 'stale' || !isScore(recovery.strainScore, 21);

        const score = recovery.recoveryScore;
        const zone = !isScore(score, 100) ? '' : score >= 67 ? 'high' : score >= 34 ? 'moderate' : 'low';
        byId('recovery-overview').dataset.zone = zone;
        const metrics = byId('recovery-metrics');
        metrics.replaceChildren();
        if (zone) {
          addMetric(metrics, 'Recovery zone', { high: 'High', moderate: 'Moderate', low: 'Low' }[zone]).id = 'recovery-zone';
        }
        for (const [label, value, unit] of [
          ['HRV', recovery.hrvMs, ' ms'],
          ['Resting heart rate', recovery.restingHeartRate, ' bpm'],
          ['Time in bed', recovery.sleepInBedMinutes, ' min'],
        ]) {
          if (Number.isFinite(value)) addMetric(metrics, label, String(value) + unit);
        }
        metrics.hidden = !metrics.childElementCount;

        const dates = byId('recovery-dates');
        dates.replaceChildren();
        for (const [label, value, dateOnly] of [
          ['Stored recovery date', recovery.storedDate, true],
          ['Recovery score updated', recovery.recoveryUpdatedAt, false],
          ['Stored sleep date', recovery.sleepStoredDate, true],
          ['Sleep record updated', recovery.sleepUpdatedAt, false],
          ['Sleep ended', recovery.sleepEndedAt, false],
          ['Stored day strain date', recovery.strainStoredDate, true],
          ['Strain record updated', recovery.strainUpdatedAt, false],
          ['Last successful batch sync', recovery.lastSyncAt, false],
        ]) {
          const time = element('time');
          if (!setTime(time, value, dateOnly)) continue;
          addMetric(dates, label, time);
        }
        dates.hidden = !dates.childElementCount;
        byId('whoop-details').hidden = metrics.hidden && dates.hidden && byId('workout-recovery').hidden;
        lastWhoopReadAt = Date.now();
        setNote('whoop-refresh-status', null);
      }

      function renderWorkoutRecovery(effort) {
        const comparison = byId('workout-recovery-metrics');
        comparison.replaceChildren();
        const hasRpe = Number.isFinite(effort?.rpe);
        const paired = effort?.status === 'paired' && hasRpe && isScore(effort.recoveryScore, 100);
        byId('workout-recovery').hidden = !hasRpe;
        comparison.hidden = !hasRpe;
        setNote('workout-recovery-note', hasRpe && !paired ? 'No verified recovery score from before this workout.' : null);
        if (paired) {
          const value = addMetric(comparison, 'Pre-workout WHOOP recovery', effort.recoveryScore + '%');
          const updated = element('time');
          if (setTime(updated, effort.recoveryUpdatedAt, false)) value.append(updated);
        }
        if (hasRpe) {
          const value = addMetric(comparison, 'Session RPE', effort.rpe + ' / 10');
          const workoutAt = element('time');
          if (setTime(workoutAt, effort.workoutAt, false)) value.append(workoutAt);
        }
      }

      function renderToday(today) {
        if (!today || !Array.isArray(today.sessions) || !Array.isArray(today.recentWork) || !today.recovery) {
          throw new Error('Today result missing');
        }
        const date = byId('today-date');
        const hasDate = setTime(date, today.date, true);
        if (!hasDate) date.removeAttribute('datetime');
        if (hasDate && activityDate.max && activityDate.max !== today.date) {
          activityDate.max = today.date;
          if (activityDate.value > today.date) {
            activityDate.value = today.date;
            if (activeView === 'activity') void loadActivity();
          }
          byId('next-day').disabled = !activityDate.value || activityDate.value >= activityDate.max;
        }
        renderAcceptedPlan(today);
        renderLastWorkout(today.lastWorkout);
        renderWorkoutRecovery(today.recovery.sessionEffort);
        renderRecovery(today.recovery);
        const readAt = byId('read-at');
        readAt.hidden = !setTime(readAt, today.readAt, false);
        return hasDate;
      }

      function render(today, features) {
        const hasDate = renderToday(today);
        const activityAvailable = features.activityEnabled === true && timezone && hasDate;
        const nutritionAvailable = features.nutritionEnabled === true && timezone;
        byId('show-activity').hidden = !activityAvailable;
        byId('show-nutrition').hidden = !nutritionAvailable;
        byId('view-switch').hidden = !activityAvailable && !nutritionAvailable;
        if (activityAvailable && !activityDate.max) {
          activityDate.max = today.date;
          activityDate.value = moveDay(today.date, -1) || today.date;
        }
      }

      function showError(message, canRetry = true) {
        byId('error-message').textContent = message;
        byId('retry').hidden = !canRetry;
      }

      function syncTodayVisibility() {
        const isToday = activeView === 'today';
        const loading = byId('retry').disabled;
        const failed = !!byId('error-message').textContent;
        byId('loading').hidden = !isToday || !loading;
        byId('load-error').hidden = !isToday || !failed;
        byId('today-content').hidden = !isToday || loading || failed;
        const date = byId('today-date');
        date.hidden = !isToday || loading || failed || !date.dateTime;
      }

      async function loadToday() {
        const retry = byId('retry');
        if (retry.disabled || host.closed) return;
        const revision = dayRevision;
        todayReadRevision += 1;
        retry.disabled = true;
        byId('error-message').textContent = '';
        syncTodayVisibility();
        try {
          if (window.parent === window) {
            showError('Open SociusFit from ChatGPT to view your saved training.', false);
            return;
          }
          if (!initialized) {
            await host.initialize('SociusFit Today', 'fullscreen');
            initialized = true;
          }
          const result = await host.request('tools/call', {
            name: 'open_socius_today',
            arguments: { tzOffset: new Date().getTimezoneOffset() },
          });
          refreshTodayIfDateChanged();
          if (host.closed || revision !== dayRevision) return;
          if (result?.isError) {
            const reconnect = result._meta?.['mcp/www_authenticate'];
            showError(reconnect ? 'Reconnect SociusFit in ChatGPT, then try again.' : 'Your saved training is temporarily unavailable.');
            return;
          }
          render(result?._meta?.today, result?._meta || {});
        } catch {
          if (!host.closed && revision === dayRevision) showError('Could not load your saved training. Try again to reconnect to the view.');
        } finally {
          retry.disabled = false;
          if (!host.closed && revision !== dayRevision) void loadToday();
          else syncTodayVisibility();
        }
      }

      async function refreshWhoop() {
        const date = byId('today-date').dateTime;
        if (host.closed || activeView !== 'today' || document.visibilityState === 'hidden'
          || whoopRefreshInFlight || byId('retry').disabled || checkInSubmit.disabled
          || !date || byId('error-message').textContent || lastWhoopReadAt === null
          || Date.now() - lastWhoopReadAt < whoopRefreshIntervalMs) return;
        const revision = todayReadRevision;
        const canRender = () => !host.closed && revision === todayReadRevision
          && activeView === 'today' && document.visibilityState !== 'hidden';
        whoopRefreshInFlight = true;
        lastWhoopReadAt = Date.now();
        try {
          const result = await host.request('tools/call', {
            name: 'open_socius_today',
            arguments: { tzOffset: new Date().getTimezoneOffset() },
          });
          if (refreshTodayIfDateChanged() || !canRender()) return;
          if (result?._meta?.['mcp/www_authenticate']) {
            setNote('whoop-refresh-status', 'Reconnect SociusFit in ChatGPT to refresh WHOOP.');
            return;
          }
          const today = result?._meta?.today;
          if (result?.isError || !today?.recovery || today.date !== date) {
            setNote('whoop-refresh-status', 'Could not refresh saved WHOOP data.');
            return;
          }
          renderRecovery(today.recovery);
        } catch {
          if (!refreshTodayIfDateChanged() && canRender()) {
            setNote('whoop-refresh-status', 'Could not refresh saved WHOOP data.');
          }
        } finally {
          whoopRefreshInFlight = false;
        }
      }

      function clearGuidance() {
        renderGuidance(null);
        setCheckInStatus('');
      }

      async function submitCheckIn(event) {
        event.preventDefault();
        if (host.closed || refreshTodayIfDateChanged() || checkInSubmit.disabled || !checkInForm.reportValidity()) return;
        const revision = dayRevision;
        todayReadRevision += 1;

        const checkIn = {
          stress: byId('check-in-stress').value,
          fatigue: byId('check-in-fatigue').value,
          sleep: byId('check-in-sleep').value,
        };
        const fields = byId('check-in-fields');
        checkInSubmit.disabled = true;
        fields.disabled = true;
        renderGuidance(null);
        setCheckInStatus('Reviewing today’s training…');
        try {
          const result = await host.request('tools/call', {
            name: 'open_socius_today',
            arguments: { tzOffset: new Date().getTimezoneOffset(), checkIn },
          });
          refreshTodayIfDateChanged();
          if (host.closed || revision !== dayRevision) return;
          if (result?._meta?.['mcp/www_authenticate']) {
            setCheckInStatus('Reconnect SociusFit in ChatGPT, then try again.', true);
            return;
          }
          const today = result?._meta?.today;
          const guidance = today?.assessmentGuidance;
          if (result?.isError || typeof guidance?.title !== 'string' || !guidance.title
            || typeof guidance.summary !== 'string' || !Array.isArray(guidance.reasons)
            || !Array.isArray(guidance.actions)) throw new Error('Recommendation result missing');
          renderToday(today);
          renderGuidance(guidance);
          syncTodayVisibility();
          setCheckInStatus('Recommendation ready.');
          if (activeView === 'today' && (document.activeElement === document.body
            || checkInForm.contains(document.activeElement))) byId('recommendation-title').focus();
        } catch {
          if (!host.closed && revision === dayRevision) setCheckInStatus('Could not get today’s recommendation. Try again.', true);
        } finally {
          if (revision === dayRevision) {
            fields.disabled = false;
            checkInSubmit.disabled = false;
          }
        }
      }

      function localDayKey(date) {
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
      }

      function refreshTodayIfDateChanged() {
        if (host.closed) return false;
        const now = new Date();
        const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        window.clearTimeout(dayTimer);
        dayTimer = window.setTimeout(refreshTodayIfDateChanged, nextDay.getTime() - now.getTime());
        const currentDay = localDayKey(now);
        if (deviceDay === currentDay) return false;

        deviceDay = currentDay;
        dayRevision += 1;
        savedRecommendation = null;
        clearGuidance();
        checkInForm.reset();
        byId('check-in-fields').disabled = false;
        checkInSubmit.disabled = false;
        byId('accepted-plan-details').open = false;
        byId('last-workout').open = false;
        void loadToday();
        return true;
      }

      function moveDay(value, step) {
        // Work in UTC calendar days so navigation never skips or repeats a date at daylight-saving changes.
        const date = new Date(value + 'T12:00:00Z');
        if (!Number.isFinite(date.getTime())) return null;
        date.setUTCDate(date.getUTCDate() + step);
        if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
        return [String(date.getUTCFullYear()).padStart(4, '0'),
          String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
      }

      async function loadActivity() {
        if (host.closed) return;
        const call = ++activityRequest;
        const date = activityDate.value;
        const status = byId('activity-load');
        const retry = byId('activity-retry');
        byId('activity-card').hidden = true;
        retry.hidden = true;
        byId('previous-day').disabled = !date || date <= activityDate.min;
        byId('next-day').disabled = !date || date >= activityDate.max;
        if (!activityDate.validity.valid) {
          status.textContent = 'Choose a date on or before today.';
          return;
        }

        status.textContent = 'Loading saved activity…';
        try {
          const result = await host.request('tools/call', {
            name: 'show_socius_activity', arguments: { date, timezone },
          });
          if (host.closed || call !== activityRequest) return;
          if (result?.isError) {
            status.textContent = result._meta?.['mcp/www_authenticate']
              ? 'Reconnect SociusFit in ChatGPT, then try again.' : 'Saved activity is temporarily unavailable.';
            retry.hidden = false;
            return;
          }
          const activity = result?._meta?.activity;
          if (activity?.date !== date) throw new Error('Activity date did not match');
          renderActivity(activity);
          status.textContent = '';
        } catch {
          if (!host.closed && call === activityRequest) {
            status.textContent = 'Could not load saved activity. Try again.';
            retry.hidden = false;
          }
        }
      }

      function stopNutritionRefresh() {
        if (nutritionRefresh !== null) window.clearInterval(nutritionRefresh);
        nutritionRefresh = null;
      }

      function stopRefreshTimers() {
        stopNutritionRefresh();
        window.clearTimeout(dayTimer);
      }

      async function loadNutrition(userRequested = false) {
        if (host.closed || activeView !== 'nutrition' || document.visibilityState === 'hidden' || nutritionInFlight) return;
        if (userRequested) nutritionSignInRequired = false;
        if (nutritionSignInRequired) return;
        const card = byId('nutrition-card');
        const status = byId('nutrition-load');
        const retryButton = byId('nutrition-retry');
        const refreshButton = byId('nutrition-refresh');
        const alreadyLoaded = !card.hidden;
        nutritionInFlight = true;
        retryButton.hidden = true;
        refreshButton.disabled = true;
        if (!alreadyLoaded) status.textContent = 'Loading saved nutrition…';
        else if (userRequested) status.textContent = 'Refreshing totals…';
        try {
          const result = await host.request('tools/call', { name: 'read_socius_nutrition', arguments: { timezone } });
          if (host.closed) return;
          if (result?._meta?.['mcp/www_authenticate']) {
            nutritionSignInRequired = true;
            card.hidden = true;
            refreshButton.hidden = true;
            status.textContent = 'Reconnect SociusFit in ChatGPT, then try again.';
            retryButton.hidden = false;
            return;
          }
          if (result?.isError || !result?._meta?.nutrition) throw new Error('Nutrition result missing');
          renderNutrition(result._meta.nutrition);
          refreshButton.hidden = false;
          status.textContent = userRequested ? 'Nutrition totals refreshed.' : '';
        } catch {
          if (!host.closed) {
            status.textContent = alreadyLoaded
              ? 'Refresh unavailable. Showing the last loaded totals.' : 'Could not load saved nutrition.';
            refreshButton.hidden = true;
            retryButton.hidden = false;
          }
        } finally {
          nutritionInFlight = false;
          refreshButton.disabled = false;
        }
      }

      function refreshNutrition() {
        void loadNutrition();
      }

      function handleForeground() {
        if (document.visibilityState === 'hidden') return;
        if (!refreshTodayIfDateChanged()) void refreshWhoop();
        refreshNutrition();
      }

      function openView(view) {
        if (activeView === view || byId('show-' + view).hidden) return;
        activeView = view;
        const views = { today: 'Today', activity: 'Activity', nutrition: 'Nutrition' };
        byId('view-title').textContent = views[view];
        for (const key of Object.keys(views)) {
          byId('show-' + key).setAttribute('aria-pressed', String(key === view));
          if (key !== 'today') byId(key + '-content').hidden = key !== view;
        }
        if (view === 'today' && !refreshTodayIfDateChanged()) void refreshWhoop();
        syncTodayVisibility();
        stopNutritionRefresh();
        if (view === 'activity') void loadActivity();
        if (view === 'nutrition') {
          refreshNutrition();
          nutritionRefresh = window.setInterval(refreshNutrition, 30_000);
        }
      }

      function changeDay(step) {
        const date = moveDay(activityDate.value, step);
        if (!date || date > activityDate.max) return;
        activityDate.value = date;
        void loadActivity();
      }

      for (const view of ['today', 'activity', 'nutrition']) {
        byId('show-' + view).addEventListener('click', () => openView(view));
      }
      byId('nutrition-retry').addEventListener('click', () => void loadNutrition(true));
      byId('nutrition-refresh').addEventListener('click', () => void loadNutrition(true));
      document.addEventListener('visibilitychange', handleForeground);
      window.addEventListener('focus', handleForeground);
      activityDate.addEventListener('change', loadActivity);
      byId('previous-day').addEventListener('click', () => changeDay(-1));
      byId('next-day').addEventListener('click', () => changeDay(1));
      byId('activity-retry').addEventListener('click', loadActivity);

      checkInForm.addEventListener('change', clearGuidance);
      checkInForm.addEventListener('submit', submitCheckIn);
      byId('retry').addEventListener('click', loadToday);
      refreshTodayIfDateChanged();
      void loadToday();
    })();
  </script>
</body>
</html>`
