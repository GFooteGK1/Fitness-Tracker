import { activityRendererScript, activityStyles, mcpHostBridgeScript, trainingHistoryCardMarkup } from './activity-app-ui'
import { mealChatMarkup, mealChatScript, nutritionCardMarkup, nutritionRendererScript, nutritionStyles } from './nutrition-app-ui'

function scaleOptions(labels: string[]) {
  return labels.map((label, index) => '<option value="' + (index + 1) + '">' + (index + 1) + ' · ' + label + '</option>').join('\n')
}

const strainOptions = scaleOptions(['Very high', 'High', 'Moderate', 'Low', 'Very low'])
const sleepOptions = scaleOptions(['Very poor', 'Poor', 'Fair', 'Good', 'Very good'])
const motivationOptions = scaleOptions(['Very low', 'Low', 'Moderate', 'High', 'Very high'])

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
    html, body { overflow: hidden; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--foreground);
      font: 1rem/1.55 system-ui, sans-serif;
    }
    #dashboard-scroll {
      --page-top-gutter: 1.25rem;
      --page-inline-gutter: 1rem;
      --page-bottom-gutter: 1.5rem;
      --bottom-clearance: max(var(--host-safe-bottom, 0px), env(safe-area-inset-bottom, 0px), var(--composer-clearance, 0px));
      height: 100vh;
      height: 100dvh;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      scroll-padding-block: max(var(--page-top-gutter), var(--host-safe-top, 0px)) var(--bottom-clearance);
    }
    #dashboard-scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    /* The fullscreen ChatGPT composer and bottom navigation can cover the iframe on phones. */
    :root[data-host-platform="mobile"] #dashboard-scroll { --composer-clearance: 9rem; }
    @media (max-width: 42rem) {
      #dashboard-scroll { --composer-clearance: 9rem; }
    }
    main {
      max-width: 62rem;
      margin: auto;
      padding:
        max(var(--page-top-gutter), var(--host-safe-top, 0px), env(safe-area-inset-top, 0px))
        max(var(--page-inline-gutter), var(--host-safe-right, 0px), env(safe-area-inset-right, 0px))
        calc(var(--page-bottom-gutter) + var(--bottom-clearance))
        max(var(--page-inline-gutter), var(--host-safe-left, 0px), env(safe-area-inset-left, 0px));
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
    #check-in-relative { margin-top: .75rem; }
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
    #check-in-submit:disabled { cursor: default; }
    .bullets { list-style: disc; padding-inline-start: 1.2rem; }
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
      #dashboard-scroll {
        --page-top-gutter: 2rem;
        --page-inline-gutter: 1.75rem;
        --page-bottom-gutter: 2rem;
      }
      .check-in-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
${activityStyles}
    @media (max-width: 29rem) {
      #activity-content .activity-date-field { flex-basis: 100%; justify-items: start; }
    }
    @media (max-width: 23rem) {
      .view-switch { gap: .35rem; }
      .view-switch button { padding-inline: .35rem; }
    }
${nutritionStyles}
  </style>
</head>
<body>
  <div id="dashboard-scroll" role="region" aria-label="SociusFit dashboard" tabindex="0">
  <main>
    <header>
      <p class="brand">SociusFit</p>
      <h1 id="view-title">Today</h1>
      <time id="today-date" hidden></time>
      <nav id="view-switch" class="view-switch" aria-label="SociusFit views" hidden>
        <button id="show-today" type="button" aria-pressed="true" aria-controls="today-content">Today</button>
        <button id="show-activity" type="button" aria-pressed="false" aria-controls="activity-content" hidden>Training history</button>
        <button id="show-nutrition" type="button" aria-pressed="false" aria-controls="nutrition-content" hidden>Nutrition</button>
      </nav>
    </header>
${mealChatMarkup}
    <p id="loading" class="muted" role="status">Loading your saved training…</p>
    <section id="load-error" class="panel" hidden>
      <p id="error-message" role="alert"></p>
      <button id="retry" type="button">Try again</button>
    </section>
    <div id="today-content" hidden>
      <section class="panel session-panel" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Today’s training</h2>
        <div id="saved-review" hidden>
          <h3 id="saved-review-title"></h3>
          <p id="saved-review-reason" class="section-note" hidden></p>
        </div>
        <details id="check-in-relative" class="recovery-timing" hidden>
          <summary>Saved answers compared with your usual</summary>
          <ul id="check-in-relative-answers" class="bullets"></ul>
        </details>
        <form id="check-in-form" autocomplete="off">
          <fieldset id="check-in-fields" class="check-in-fields" aria-describedby="check-in-instructions" disabled>
            <legend>How do you feel today?</legend>
            <p id="check-in-instructions" class="muted">Rate each from 1 (worst) to 5 (best).</p>
            <div class="check-in-grid">
              <label>Stress
                <select id="check-in-stress" required>
                  <option value="" selected disabled>Choose one</option>
                  ${strainOptions}
                </select>
              </label>
              <label>Fatigue
                <select id="check-in-fatigue" required>
                  <option value="" selected disabled>Choose one</option>
                  ${strainOptions}
                </select>
              </label>
              <label>Sleep
                <select id="check-in-sleep" required>
                  <option value="" selected disabled>Choose one</option>
                  ${sleepOptions}
                </select>
              </label>
              <label>Soreness
                <select id="check-in-soreness" required>
                  <option value="" selected disabled>Choose one</option>
                  ${strainOptions}
                </select>
              </label>
              <label>Motivation
                <select id="check-in-motivation" required>
                  <option value="" selected disabled>Choose one</option>
                  ${motivationOptions}
                </select>
              </label>
            </div>
          </fieldset>
          <button id="check-in-submit" type="submit" disabled>Save check-in</button>
          <p id="check-in-status" role="status" class="muted"></p>
        </form>
        <p id="check-in-next" class="section-note" tabindex="-1" hidden><span id="draft-request-status" role="status"></span><span id="draft-manual">Ask <strong>“Draft today’s session”</strong> in SociusFit chat.</span></p>
        <details id="accepted-plan-details" class="recovery-timing" hidden>
          <summary>Accepted plan for today</summary>
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
        <label class="activity-date-field" for="activity-date">Workout date
          <input id="activity-date" type="date" min="0001-01-01" required>
        </label>
        <button id="previous-day" type="button">Previous day</button>
        <button id="next-day" type="button">Next day</button>
      </div>
      <p id="activity-load" class="muted" role="status"></p>
      <button id="activity-retry" type="button" hidden>Try again</button>
${trainingHistoryCardMarkup}
    </section>
    <section id="nutrition-content" class="panel" aria-labelledby="view-title" hidden>
      <button id="nutrition-log" type="button" aria-controls="meal-chat" aria-expanded="false" hidden>Log food in chat</button>
      <p id="nutrition-load" class="muted" role="status"></p>
      <button id="nutrition-retry" type="button" hidden>Try again</button>
${nutritionCardMarkup}
      <button id="nutrition-refresh" class="secondary-action" type="button" hidden>Refresh totals</button>
    </section>
  </main>
  </div>
  <script>
    (() => {
      const byId = id => document.getElementById(id);
${activityRendererScript}
${nutritionRendererScript}
${mealChatScript}
${mcpHostBridgeScript}
      const dashboardScroll = byId('dashboard-scroll');
      const host = createMcpHostBridge({
        onClosed: stopRefreshTimers,
        onHostContext(context) {
          const root = document.documentElement;
          if (['mobile', 'desktop', 'web'].includes(context?.platform)) {
            root.dataset.hostPlatform = context.platform;
          }
          for (const edge of ['top', 'right', 'bottom', 'left']) {
            const inset = context?.safeAreaInsets?.[edge];
            if (Number.isFinite(inset) && inset >= 0) {
              root.style.setProperty('--host-safe-' + edge, inset + 'px');
            }
          }
        },
      });
      const mealChat = setupMealChat(host, byId);
      const activityDate = byId('activity-date');
      const checkInForm = byId('check-in-form');
      const checkInSubmit = byId('check-in-submit');
      const checkInFields = byId('check-in-fields');
      const checkInInputs = ['stress', 'fatigue', 'sleep', 'soreness', 'motivation'];
      const relativeRatings = {
        lower: 'Lower than usual', usual: 'Usual', higher: 'Higher than usual',
        worse: 'Worse than usual', better: 'Better than usual',
      };
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let initialized = false;
      let activityRequest = 0;
      let activeView = 'today';
      let nutritionRefresh = null;
      let nutritionInFlight = false;
      let nutritionSignInRequired = false;
      let savedAssessment = null;
      let unconfirmedCheckIn = null;
      let checkInEnabled = false;
      let checkInBusy = false;
      let hostSupportsDraft = false;
      let draftInFlightDay = null;
      let draftRevision = 0;
      let dayTimer = null;
      let deviceDay = localDayKey(new Date());
      let dayRevision = 0;
      let todayReadRevision = 0;
      let whoopRefreshInFlight = false;
      let lastWhoopReadAt = null;
      let displayedWorkoutRecoveryKey = null;
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
        const statusLabels = { planned: 'Planned', completed: 'Completed', skipped: 'Skipped' };
        byId('sessions').replaceChildren(...today.sessions.map(session => {
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
        byId('accepted-plan-details').hidden = today.sessions.length === 0;
      }

      function renderSafetyReview(review) {
        const showReview = review?.reviewBeforeTraining === true && !!review.title;
        byId('saved-review').hidden = !showReview;
        setNote('saved-review-title', showReview ? review.title : null);
        setNote('saved-review-reason', showReview ? review.reason : null);
      }

      function setCheckInStatus(text, isError = false) {
        const status = byId('check-in-status');
        status.textContent = text;
        status.toggleAttribute('data-error', isError);
      }

      function checkInValues() {
        return Object.fromEntries(checkInInputs.map(name => {
          const value = byId('check-in-' + name).value;
          return [name, value === '' ? null : Number(value)];
        }));
      }

      function isRating(value) {
        return Number.isInteger(value) && value >= 1 && value <= 5;
      }

      function parseAssessment(assessment) {
        if (assessment?.status === 'missing') return assessment;
        const answers = assessment?.checkIn;
        if (assessment?.status === 'saved' && answers) {
          if (assessment.scale === '1-to-5' && checkInInputs.every(name => isRating(answers[name]))) return assessment;
          if (assessment.scale === 'relative-to-usual' && checkInInputs.every(name =>
            (name === 'sleep' ? ['worse', 'usual', 'better'] : ['lower', 'usual', 'higher']).includes(answers[name]))) {
            return assessment;
          }
        }
        return { status: 'unavailable' };
      }

      function matchesCheckIn(saved, answers) {
        return !!saved && checkInInputs.every(name => saved[name] === answers[name]);
      }

      function matchesSavedAssessment(answers) {
        if (savedAssessment?.scale === 'relative-to-usual') {
          return checkInInputs.every(name => answers[name] === null);
        }
        return matchesCheckIn(savedAssessment?.checkIn, answers);
      }

      function setSavedAssessment(assessment) {
        savedAssessment = assessment.status === 'saved' ? assessment : null;
        const relative = savedAssessment?.scale === 'relative-to-usual' ? savedAssessment.checkIn : null;
        const detail = byId('check-in-relative');
        detail.hidden = !relative;
        if (!relative) detail.open = false;
        byId('check-in-relative-answers').replaceChildren(...(relative ? checkInInputs.map(name => {
          const label = name[0].toUpperCase() + name.slice(1);
          return element('li', label + ' · ' + relativeRatings[relative[name]]);
        }) : []));
      }

      function canRequestDraft() {
        return hostSupportsDraft && byId('saved-review').hidden;
      }

      function setDraftFeedback(message, showManual = false) {
        byId('draft-request-status').textContent = message;
        byId('draft-manual').hidden = !showManual;
      }

      function resetDraftFeedback() {
        draftRevision += 1;
        setDraftFeedback('', true);
      }

      function syncCheckInControls() {
        const matchesSaved = matchesSavedAssessment(checkInValues());
        checkInFields.disabled = !checkInEnabled || checkInBusy;
        checkInSubmit.disabled = checkInFields.disabled || draftInFlightDay === dayRevision
          || (matchesSaved && !unconfirmedCheckIn);
        checkInSubmit.formNoValidate = !!unconfirmedCheckIn;
        checkInSubmit.textContent = unconfirmedCheckIn ? 'Check save status'
          : canRequestDraft() ? 'Save check-in & draft session' : 'Save check-in';
        byId('check-in-next').hidden = !!unconfirmedCheckIn || !matchesSaved || !byId('saved-review').hidden;
      }

      function renderCheckIn(today, features) {
        const assessment = parseAssessment(today.assessment ?? { ...today.checkIn, scale: 'relative-to-usual' });
        setSavedAssessment(assessment);
        unconfirmedCheckIn = null;
        resetDraftFeedback();
        checkInEnabled = !!today.assessment && features.checkInEnabled === true && assessment.status !== 'unavailable';
        const scores = savedAssessment?.scale === '1-to-5' ? savedAssessment.checkIn : null;
        for (const name of checkInInputs) byId('check-in-' + name).value = scores ? String(scores[name]) : '';
        if (savedAssessment?.scale === 'relative-to-usual') {
          setCheckInStatus(checkInEnabled
            ? 'Previous check-in saved. You can enter 1–5 ratings for today.'
            : 'Previous check-in saved. 1–5 ratings are currently unavailable.');
        } else if (savedAssessment) {
          setCheckInStatus(checkInEnabled ? 'Check-in saved for today.' : 'Check-in saved for today. Editing is currently unavailable.');
        } else {
          setCheckInStatus(checkInEnabled ? '' : '1–5 check-ins are currently unavailable.');
        }
        syncCheckInControls();
      }

      function editCheckIn() {
        if (unconfirmedCheckIn) unconfirmedCheckIn.draftRequested = false;
        resetDraftFeedback();
        const matchesSaved = matchesSavedAssessment(checkInValues());
        setCheckInStatus(unconfirmedCheckIn ? 'Check the previous save before submitting new answers.'
          : matchesSaved ? 'Check-in saved for today.' : savedAssessment ? 'Unsaved changes.' : '');
        syncCheckInControls();
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
          ['Last successful batch timestamp', recovery.lastSyncAt, false],
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
        setNote('workout-recovery-note', hasRpe && !paired ? 'No WHOOP recovery score verified for this workout.' : null);
        if (paired) {
          const value = addMetric(comparison, 'WHOOP recovery updated before workout', effort.recoveryScore + '%');
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
        renderSafetyReview(today.workoutRecommendation);
        renderLastWorkout(today.lastWorkout);
        displayedWorkoutRecoveryKey = today.workoutRecoveryKey ?? null;
        renderWorkoutRecovery(today.recovery.sessionEffort);
        renderRecovery(today.recovery);
        const readAt = byId('read-at');
        readAt.hidden = !setTime(readAt, today.readAt, false);
        return hasDate;
      }

      function render(today, features) {
        const hasDate = renderToday(today);
        renderCheckIn(today, { checkInEnabled: hasDate && features.checkInEnabled });
        const activityAvailable = features.activityEnabled === true && timezone && hasDate;
        const nutritionAvailable = features.nutritionEnabled === true && timezone;
        byId('show-activity').hidden = !activityAvailable;
        byId('show-nutrition').hidden = !nutritionAvailable;
        mealChat.setAvailable(nutritionAvailable && features.nutritionWritesEnabled === true);
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
            const capabilities = await host.initialize('SociusFit Today', 'fullscreen');
            hostSupportsDraft = Boolean(capabilities.message?.text);
            mealChat.setCapabilities(capabilities);
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
          || whoopRefreshInFlight || byId('retry').disabled || checkInBusy
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
          if (displayedWorkoutRecoveryKey && today.workoutRecoveryKey === displayedWorkoutRecoveryKey) {
            renderWorkoutRecovery(today.recovery.sessionEffort);
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

      async function requestSessionDraft(date, tzOffset, isCurrent) {
        if (!canRequestDraft() || !isCurrent() || activeView !== 'today'
          || document.visibilityState !== 'visible' || byId('today-date').dateTime !== date
          || date !== deviceDay || new Date().getTimezoneOffset() !== tzOffset
          || draftInFlightDay === dayRevision) return;
        const day = dayRevision;
        const revision = draftRevision;
        const canReport = () => isCurrent() && revision === draftRevision;
        draftInFlightDay = day;
        setDraftFeedback('Requesting a session draft in SociusFit chat…');
        syncCheckInControls();
        try {
          const result = await host.request('ui/message', {
            role: 'user',
            content: [{
              type: 'text',
              text: 'Draft today’s session. Use expectedLocalDate ' + date + ' and browser tzOffset ' + tzOffset + ' minutes (JavaScript getTimezoneOffset).',
            }],
          });
          if (!result || typeof result !== 'object' || Array.isArray(result) || result.isError) {
            throw new Error('Draft request was not acknowledged');
          }
          if (canReport()) setDraftFeedback('Draft requested. If no draft appears, ask “Draft today’s session” in SociusFit chat.');
        } catch {
          if (canReport()) setDraftFeedback('Could not confirm the draft request. Check SociusFit chat before asking again. ', true);
        } finally {
          if (draftInFlightDay === day) {
            draftInFlightDay = null;
            syncCheckInControls();
          }
        }
      }

      async function submitCheckIn(event) {
        event.preventDefault();
        if (host.closed || refreshTodayIfDateChanged() || checkInSubmit.disabled) return;
        const checkIn = checkInValues();
        if (!unconfirmedCheckIn && (!checkInForm.reportValidity() || !checkInInputs.every(name => isRating(checkIn[name])))) return;
        const date = byId('today-date').dateTime;
        const tzOffset = new Date().getTimezoneOffset();
        const revision = dayRevision;
        const submittedAnswers = unconfirmedCheckIn?.answers ?? checkIn;
        const answersStillMatch = matchesCheckIn(submittedAnswers, checkIn);
        const draftRequested = unconfirmedCheckIn
          ? unconfirmedCheckIn.draftRequested && answersStillMatch
          : canRequestDraft();
        let confirmed = false;
        checkInBusy = true;
        resetDraftFeedback();
        syncCheckInControls();
        const isCurrent = () => !refreshTodayIfDateChanged() && !host.closed && revision === dayRevision;
        try {
          if (!unconfirmedCheckIn) {
            setCheckInStatus('Saving today’s check-in…');
            let connectionRejected = false;
            const result = await host.request('tools/call', {
              name: 'save_socius_today_check_in', arguments: { date, tzOffset, checkIn: submittedAnswers },
            }).catch(error => {
              connectionRejected = error.code === -32601 || error.code === -32602;
              return null;
            });
            if (!isCurrent()) return;
            if (result?._meta?.['mcp/www_authenticate']) {
              setCheckInStatus('Reconnect SociusFit in ChatGPT to save your check-in.', true);
              return;
            }
            const receipt = result?._meta?.savedCheckIn;
            if (!result?.isError && receipt?.date === date && matchesCheckIn(receipt.checkIn, submittedAnswers)) {
              confirmed = true;
              return;
            }
            unconfirmedCheckIn = { answers: submittedAnswers, draftRequested, connectionRejected };
          }
          setCheckInStatus('Checking whether your answers were saved…');
          const result = await host.request('tools/call', {
            name: 'open_socius_today', arguments: { tzOffset },
          });
          if (!isCurrent()) return;
          if (result?._meta?.['mcp/www_authenticate']) {
            setCheckInStatus('Reconnect SociusFit in ChatGPT to confirm whether your check-in was saved.', true);
            return;
          }
          const today = result?._meta?.today;
          const stored = parseAssessment(today?.assessment);
          if (result?.isError || today?.date !== date || stored.status === 'unavailable') {
            setCheckInStatus('Could not confirm the check-in was saved. Try again to check.', true);
            return;
          }
          renderSafetyReview(today.workoutRecommendation);
          const { connectionRejected } = unconfirmedCheckIn;
          unconfirmedCheckIn = null;
          setSavedAssessment(stored);
          confirmed = stored.scale === '1-to-5' && matchesCheckIn(stored.checkIn, submittedAnswers);
          if (!confirmed) {
            if (connectionRejected) {
              setCheckInStatus('The SociusFit connection rejected the check-in request. Select Refresh tools in SociusFit’s ChatGPT settings, then reopen the app and try again.', true);
            } else if (stored.status === 'missing') {
              setCheckInStatus('Your check-in wasn’t saved. Your answers are still here. Try saving again.', true);
            } else {
              setCheckInStatus('The saved answers don’t match. Save again to use these answers.', true);
            }
          }
        } catch {
          if (isCurrent()) setCheckInStatus('Could not confirm the check-in was saved. Try again to check.', true);
        } finally {
          if (revision === dayRevision) {
            checkInBusy = false;
            if (confirmed) {
              setSavedAssessment({ status: 'saved', scale: '1-to-5', checkIn: submittedAnswers });
              unconfirmedCheckIn = null;
              setCheckInStatus(answersStillMatch ? 'Check-in saved for today.'
                : 'Your previous check-in was saved. Save again to use your edited answers.');
            }
            syncCheckInControls();
            if (confirmed && draftRequested) void requestSessionDraft(date, tzOffset, isCurrent);
            const next = byId('check-in-next');
            if (confirmed && !next.hidden && activeView === 'today' && (document.activeElement === document.body
              || checkInForm.contains(document.activeElement))) next.focus();
          }
        }
      }

      function localDayKey(date) {
        return [String(date.getFullYear()).padStart(4, '0'),
          String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
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
        checkInBusy = false;
        renderCheckIn({}, {});
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

        status.textContent = 'Loading saved workouts…';
        try {
          const result = await host.request('tools/call', {
            name: 'show_socius_activity', arguments: { date, timezone },
          });
          if (host.closed || call !== activityRequest) return;
          if (result?.isError) {
            status.textContent = result._meta?.['mcp/www_authenticate']
              ? 'Reconnect SociusFit in ChatGPT, then try again.' : 'Saved workouts are temporarily unavailable.';
            retry.hidden = false;
            return;
          }
          const activity = result?._meta?.activity;
          if (activity?.date !== date) throw new Error('Activity date did not match');
          renderActivity(activity, ['workouts']);
          status.textContent = '';
        } catch {
          if (!host.closed && call === activityRequest) {
            status.textContent = 'Could not load saved workouts. Try again.';
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
        const views = { today: 'Today', activity: 'Training history', nutrition: 'Nutrition' };
        byId('view-title').textContent = views[view];
        for (const key of Object.keys(views)) {
          byId('show-' + key).setAttribute('aria-pressed', String(key === view));
          if (key !== 'today') byId(key + '-content').hidden = key !== view;
        }
        if (view === 'today' && !refreshTodayIfDateChanged()) void refreshWhoop();
        syncTodayVisibility();
        dashboardScroll.scrollTop = 0;
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

      checkInForm.addEventListener('change', editCheckIn);
      checkInForm.addEventListener('submit', submitCheckIn);
      byId('retry').addEventListener('click', loadToday);
      refreshTodayIfDateChanged();
      void loadToday();
    })();
  </script>
</body>
</html>`
