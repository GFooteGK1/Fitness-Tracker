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
      min-width: 0;
      margin-bottom: 1rem;
      padding: clamp(1rem, 3vw, 1.5rem);
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
    #ask { margin-top: 1rem; }
    #ask-status:not(:empty) { margin-top: .55rem; }
    #recommendation-title:not(:empty) { margin-top: .45rem; font-size: clamp(1.25rem, 4vw, 1.65rem); }
    #accepted-plan-label { margin-top: 1rem; }
    #workout-date { margin-top: .45rem; }
    #nutrition-log, #nutrition-retry, #nutrition-load:not(:empty), #nutrition-ask-status:not(:empty) { margin-top: .65rem; }
    #load-error { color: var(--danger); background: var(--danger-soft); }
    footer { color: var(--muted); }
    @media (min-width: 42rem) {
      main { padding-inline: 1.75rem; padding-block: 2rem; }
      .secondary { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; }
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
        <h2 id="sessions-title">Workout recommendation</h2>
        <h3 id="recommendation-title" hidden></h3>
        <p id="recommendation-source" class="entry-state section-note" hidden></p>
        <p id="sessions-note" class="muted section-note" hidden></p>
        <h3 id="accepted-plan-label" hidden>Accepted plan for today</h3>
        <ul id="sessions"></ul>
        <button id="ask" type="button" hidden>Ask about today</button>
        <p id="ask-status" class="muted" role="status"></p>
      </section>
      <div class="secondary">
        <section class="panel" aria-labelledby="recent-title">
          <h2 id="recent-title">Last completed workout</h2>
          <time id="workout-date" hidden></time>
          <p id="workout-rpe" class="muted section-note" hidden></p>
          <p id="recent-note" class="muted section-note" hidden></p>
          <ul id="recent"></ul>
        </section>
        <section class="panel" aria-labelledby="recovery-title">
          <h2 id="recovery-title">WHOOP recovery</h2>
          <p id="recovery-status" class="recovery-state"></p>
          <p id="recovery-note" class="muted status-label" hidden></p>
          <dl id="recovery-dates"></dl>
        </section>
      </div>
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
      <button id="activity-ask" type="button" hidden>Ask about this day</button>
      <p id="activity-ask-status" class="muted" role="status" hidden></p>
    </section>
    <section id="nutrition-content" class="panel" aria-labelledby="view-title" hidden>
      <p id="nutrition-load" class="muted" role="status"></p>
      <button id="nutrition-retry" type="button" hidden>Try again</button>
${nutritionCardMarkup}
      <button id="nutrition-log" type="button" hidden>Log food in chat</button>
      <p id="nutrition-ask-status" class="muted" role="status" hidden></p>
    </section>
  </main>
  <script>
    (() => {
      const byId = id => document.getElementById(id);
${activityRendererScript}
${nutritionRendererScript}
${mcpHostBridgeScript}
      const host = createMcpHostBridge({ onClosed: stopNutritionRefresh });
      const ask = byId('ask');
      const activityDate = byId('activity-date');
      const activityAsk = byId('activity-ask');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let capabilities = null;
      let activityRequest = 0;
      let activeView = 'today';
      let nutritionRefresh = null;
      let nutritionInFlight = false;
      let nutritionSignInRequired = false;
      let nutritionCanLog = false;

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

      function renderRecommendation(today) {
        const recommendation = today.workoutRecommendation;
        const sessions = recommendation?.sessions ?? today.sessions;
        const statusLabels = { planned: 'Planned', completed: 'Completed', skipped: 'Skipped' };
        const labels = {
          unscheduled: 'No workout recommendation is saved for today. Ask SociusFit what fits your schedule and recent training.',
          unavailable: 'Your workout recommendation is currently unavailable.',
        };
        setNote('recommendation-title', recommendation?.title);
        setNote('recommendation-source', recommendation?.source === 'saved_recommendation' ? 'SociusFit recommendation'
          : recommendation?.source === 'accepted_plan' ? 'From your accepted plan' : null);
        setNote('sessions-note', recommendation?.reason ?? labels[recommendation?.status]
          ?? (sessions.length ? null : labels.unscheduled));
        byId('accepted-plan-label').hidden = recommendation?.source !== 'saved_recommendation' || !sessions.length;
        byId('sessions').replaceChildren(...sessions.map(session => {
          const item = element('li', null, 'entry');
          const heading = element('div', null, 'entry-heading');
          if (session.title !== recommendation?.title || sessions.length > 1) {
            heading.append(element('h3', session.title || 'Training session'));
          }
          if (statusLabels[session.status]) {
            heading.append(element('span', statusLabels[session.status], 'entry-state'));
          }
          item.append(heading);
          if (session.focus) item.append(element('p', session.focus, 'muted'));
          if (session.details?.length) {
            const details = element('ul', null, 'metrics');
            details.append(...session.details.map(value => element('li', value)));
            item.append(details);
          }
          return item;
        }));
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
        byId('recent').replaceChildren(...(workout?.movements ?? []).map(work => {
          const item = element('li', null, 'entry');
          item.append(element('h3', work.name));
          if (work.measurements.length) {
            const metrics = element('ul', null, 'metrics');
            metrics.append(...work.measurements.map(value => element('li', value)));
            item.append(metrics);
          }
          return item;
        }));
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
        const dates = byId('recovery-dates');
        dates.replaceChildren();
        function addMetric(label, detail) {
          const row = element('div');
          const value = element('dd');
          value.append(detail);
          row.append(element('dt', label), value);
          dates.append(row);
        }
        for (const [label, value, unit] of [
          ['Recovery score', recovery.recoveryScore, '%'],
          ['Heart rate variability', recovery.hrvMs, ' ms'],
          ['Resting heart rate', recovery.restingHeartRate, ' bpm'],
          ['Sleep performance', recovery.sleepPerformance, '%'],
          ['Time in bed', recovery.sleepInBedMinutes, ' min'],
        ]) {
          if (Number.isFinite(value)) addMetric(label, String(value) + unit);
        }
        for (const [label, value, dateOnly] of [
          ['Stored recovery date', recovery.storedDate, true],
          ['WHOOP score updated', recovery.recoveryUpdatedAt, false],
          ['Sleep ended', recovery.sleepEndedAt, false],
          ['Last sync', recovery.lastSyncAt, false],
        ]) {
          const time = element('time');
          if (!setTime(time, value, dateOnly)) continue;
          addMetric(label, time);
        }
        const effort = recovery.sessionEffort;
        if (effort?.status === 'paired' && Number.isFinite(effort.rpe) && Number.isFinite(effort.recoveryScore)) {
          addMetric('Last workout comparison', 'Earlier WHOOP recovery ' + effort.recoveryScore + '% · Session RPE ' + effort.rpe + ' / 10');
        } else if (Number.isFinite(effort?.rpe)) {
          addMetric('Last workout comparison', 'No verified earlier recovery score for session RPE ' + effort.rpe + ' / 10.');
        }
      }

      function render(today, features) {
        if (!today || !Array.isArray(today.sessions) || !Array.isArray(today.recentWork) || !today.recovery) {
          throw new Error('Today result missing');
        }
        const date = byId('today-date');
        date.hidden = !setTime(date, today.date, true);
        renderRecommendation(today);
        renderLastWorkout(today.lastWorkout);
        renderRecovery(today.recovery);
        const readAt = byId('read-at');
        readAt.hidden = !setTime(readAt, today.readAt, false);
        ask.hidden = !capabilities?.message?.text;
        byId('today-content').hidden = false;
        const activityAvailable = features.activityEnabled === true && timezone && !date.hidden;
        const nutritionAvailable = features.nutritionEnabled === true && timezone;
        nutritionCanLog = features.nutritionWritesEnabled === true && Boolean(capabilities?.message?.text);
        byId('nutrition-log').hidden = !nutritionCanLog;
        byId('show-activity').hidden = !activityAvailable;
        byId('show-nutrition').hidden = !nutritionAvailable;
        byId('view-switch').hidden = !activityAvailable && !nutritionAvailable;
        if (activityAvailable) {
          activityDate.max = today.date;
          activityDate.value = moveDay(today.date, -1) || today.date;
        }
      }

      function showError(message, canRetry = true) {
        byId('error-message').textContent = message;
        byId('load-error').hidden = false;
        byId('retry').hidden = !canRetry;
      }

      async function loadToday() {
        const retry = byId('retry');
        if (retry.disabled || host.closed) return;
        retry.disabled = true;
        byId('load-error').hidden = true;
        byId('error-message').textContent = '';
        byId('today-content').hidden = true;
        byId('today-date').hidden = true;
        byId('view-switch').hidden = true;
        byId('loading').hidden = false;
        try {
          if (window.parent === window) {
            showError('Open SociusFit from ChatGPT to view your saved training.', false);
            return;
          }
          if (!capabilities) capabilities = await host.initialize('SociusFit Today', 'fullscreen');
          const result = await host.request('tools/call', {
            name: 'open_socius_today',
            arguments: { tzOffset: new Date().getTimezoneOffset() },
          });
          if (result?.isError) {
            const reconnect = result._meta?.['mcp/www_authenticate'];
            showError(reconnect ? 'Reconnect SociusFit in ChatGPT, then try again.' : 'Your saved training is temporarily unavailable.');
            return;
          }
          render(result?._meta?.today, result?._meta || {});
        } catch {
          if (!host.closed) showError('Could not load your saved training. Try again to reconnect to the view.');
        } finally {
          retry.disabled = false;
          byId('loading').hidden = true;
        }
      }

      async function askInChat(button, status, question) {
        if (host.closed || !capabilities?.message?.text || button.disabled) return;
        button.disabled = true;
        status.hidden = false;
        status.textContent = '';
        const canDraft = Boolean(capabilities.experimental?.['openai/message']);
        try {
          const result = await host.request('ui/message', {
            role: 'user',
            content: [{ type: 'text', text: question }],
            ...(canDraft ? { _meta: { 'openai/message': { target: 'new', send: false } } } : {}),
          });
          if (result?.isError) throw new Error('Chat unavailable');
          status.textContent = canDraft ? 'Draft opened in ChatGPT.' : 'Sent to ChatGPT.';
        } catch {
          if (!host.closed) status.textContent = 'Could not open the question. You can ask in the ChatGPT composer.';
        } finally {
          button.disabled = false;
        }
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
        activityAsk.hidden = true;
        byId('activity-ask-status').hidden = true;
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
          activityAsk.hidden = !capabilities?.message?.text;
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

      async function loadNutrition(retry = false) {
        if (host.closed || activeView !== 'nutrition' || document.visibilityState === 'hidden' || nutritionInFlight) return;
        if (retry) nutritionSignInRequired = false;
        if (nutritionSignInRequired) return;
        const card = byId('nutrition-card');
        const status = byId('nutrition-load');
        const retryButton = byId('nutrition-retry');
        const alreadyLoaded = !card.hidden;
        nutritionInFlight = true;
        retryButton.hidden = true;
        if (!alreadyLoaded) status.textContent = 'Loading saved nutrition…';
        try {
          const result = await host.request('tools/call', { name: 'read_socius_nutrition', arguments: { timezone } });
          if (host.closed) return;
          if (result?._meta?.['mcp/www_authenticate']) {
            nutritionSignInRequired = true;
            card.hidden = true;
            byId('nutrition-log').hidden = true;
            status.textContent = 'Reconnect SociusFit in ChatGPT, then try again.';
            retryButton.hidden = false;
            return;
          }
          if (result?.isError || !result?._meta?.nutrition) throw new Error('Nutrition result missing');
          renderNutrition(result._meta.nutrition);
          byId('nutrition-log').hidden = !nutritionCanLog;
          status.textContent = '';
        } catch {
          if (!host.closed) {
            status.textContent = alreadyLoaded
              ? 'Refresh unavailable. Showing the last loaded totals.' : 'Could not load saved nutrition.';
            retryButton.hidden = false;
          }
        } finally {
          nutritionInFlight = false;
        }
      }

      function refreshNutrition() {
        void loadNutrition();
      }

      function openView(view) {
        if (activeView === view || byId('show-' + view).hidden) return;
        activeView = view;
        const views = { today: 'Today', activity: 'Activity', nutrition: 'Nutrition' };
        byId('view-title').textContent = views[view];
        for (const key of Object.keys(views)) {
          byId('show-' + key).setAttribute('aria-pressed', String(key === view));
          byId(key + '-content').hidden = key !== view;
        }
        const date = byId('today-date');
        date.hidden = view !== 'today' || !date.dateTime;
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

      ask.addEventListener('click', () => {
        void askInChat(ask, byId('ask-status'),
          'Review my workout recommendation for today using my saved SociusFit context. Explain what you recommend and help me discuss any changes. Keep this read-only.');
      });
      activityAsk.addEventListener('click', () => {
        void askInChat(activityAsk, byId('activity-ask-status'),
          'Show my saved workouts and logged meals in the SociusFit Activity card for ' + activityDate.value
          + ' (' + timezone + '). Use text if a card is unavailable. Keep this read-only.');
      });
      byId('nutrition-log').addEventListener('click', () => {
        void askInChat(byId('nutrition-log'), byId('nutrition-ask-status'),
          'I want to log food I actually ate. Ask what I ate and how much, then record it in SociusFit once the details are ready. Tell me when the save is confirmed.');
      });
      for (const view of ['today', 'activity', 'nutrition']) {
        byId('show-' + view).addEventListener('click', () => openView(view));
      }
      byId('nutrition-retry').addEventListener('click', () => void loadNutrition(true));
      document.addEventListener('visibilitychange', refreshNutrition);
      window.addEventListener('focus', refreshNutrition);
      activityDate.addEventListener('change', loadActivity);
      byId('previous-day').addEventListener('click', () => changeDay(-1));
      byId('next-day').addEventListener('click', () => changeDay(1));
      byId('activity-retry').addEventListener('click', loadActivity);

      byId('retry').addEventListener('click', loadToday);
      void loadToday();
    })();
  </script>
</body>
</html>`
