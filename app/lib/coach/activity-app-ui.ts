export const activityStyles = String.raw`
    .view-switch, .activity-date-controls { display: flex; flex-wrap: wrap; gap: .5rem; }
    .view-switch { margin-top: .85rem; }
    .view-switch button[aria-pressed="false"], .activity-date-controls button {
      color: var(--foreground);
      background: var(--surface);
      border-color: var(--line);
    }
    .activity-date-controls { align-items: end; }
    .activity-date-field { display: grid; gap: .2rem; }
    .activity-date-field input {
      min-height: 44px;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: .7rem;
      padding: .45rem .7rem;
      background: var(--surface);
      color: var(--foreground);
      font: inherit;
    }
    .activity-date-field input:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    #activity-load:not(:empty), #activity-retry { margin-top: .65rem; }
    #activity-card { margin-top: .9rem; }
    #activity-card time { display: block; margin-bottom: .65rem; }
    #activity-card .entry h3 { margin-bottom: .25rem; }
    .activity-columns { display: grid; gap: 1rem; }
    .activity-columns > section { min-width: 0; }
    .activity-detail { color: var(--muted); }
    @media (min-width: 38rem) {
      .activity-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
`

const activityWorkoutEntries = String.raw`          <p id="activity-workouts-note" class="muted section-note" hidden></p>
          <ul id="activity-workouts"></ul>`

export const trainingHistoryCardMarkup = String.raw`
    <div id="activity-card" hidden>
      <h2><time id="activity-card-date"></time></h2>
${activityWorkoutEntries}
    </div>
`

export const activityCardMarkup = String.raw`
    <div id="activity-card" hidden>
      <time id="activity-card-date"></time>
      <div class="activity-columns" aria-label="Saved activity">
        <section aria-labelledby="activity-workouts-title">
          <h2 id="activity-workouts-title">Workouts</h2>
${activityWorkoutEntries}
        </section>
        <section aria-labelledby="activity-meals-title">
          <h2 id="activity-meals-title">Meals</h2>
          <p id="activity-meals-note" class="muted section-note" hidden></p>
          <ul id="activity-meals"></ul>
          <p id="activity-meals-coverage" class="muted section-note" hidden>Full-day intake is unknown.</p>
        </section>
      </div>
    </div>
`

export const activityRendererScript = String.raw`
      function renderActivity(activity, domains = ['workouts', 'meals']) {
        if (!activity || typeof activity.date !== 'string' || typeof activity.timezone !== 'string') {
          throw new Error('Activity result missing');
        }
        const date = new Date(activity.date + 'T12:00:00Z');
        if (!Number.isFinite(date.getTime())) throw new Error('Activity date missing');
        const dateLabel = document.getElementById('activity-card-date');
        dateLabel.dateTime = activity.date;
        dateLabel.textContent = new Intl.DateTimeFormat(undefined, {
          weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        }).format(date);

        for (const domain of domains) {
          const records = activity[domain];
          if (!records || !Array.isArray(records.entries)
            || !['available', 'partial', 'no_records', 'unavailable'].includes(records.status)) {
            throw new Error('Activity coverage missing');
          }
          const note = document.getElementById('activity-' + domain + '-note');
          const messages = {
            partial: 'Some saved ' + domain + ' or details are unavailable.',
            no_records: 'No ' + domain + ' were logged for this date.',
            unavailable: 'Saved ' + domain + ' are currently unavailable.',
          };
          note.textContent = messages[records.status] || '';
          note.hidden = !note.textContent;

          const entries = records.entries.map(entry => {
            const item = document.createElement('li');
            item.className = 'entry';
            const title = document.createElement('h3');
            title.textContent = entry.label;
            item.append(title);
            if (Number.isInteger(entry.revision) && entry.revision > 1) {
              const correction = document.createElement('p');
              correction.className = 'entry-state';
              correction.textContent = 'Revised';
              item.append(correction);
            }
            if (entry.details.length) {
              const details = document.createElement('ul');
              details.className = 'activity-detail';
              for (const text of entry.details) {
                const detail = document.createElement('li');
                detail.textContent = text;
                details.append(detail);
              }
              item.append(details);
            }
            return item;
          });
          document.getElementById('activity-' + domain).replaceChildren(...entries);
        }
        if (domains.includes('meals')) {
          document.getElementById('activity-meals-coverage').hidden = activity.meals.status === 'unavailable';
        }
        document.getElementById('activity-card').hidden = false;
      }
`

/** Shared transport for the full-screen and inline resources. Only the host can send results or context. */
export const mcpHostBridgeScript = String.raw`
      function createMcpHostBridge({ onToolResult, onClosed, onHostContext } = {}) {
        const pending = new Map();
        let requestId = 0;
        let closed = false;

        function post(message) {
          window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
        }

        function request(method, params) {
          return new Promise((resolve, reject) => {
            const id = ++requestId;
            const timeout = setTimeout(() => {
              pending.delete(id);
              reject(new Error('Host response timed out'));
            }, 12000);
            pending.set(id, { resolve, reject, timeout });
            post({ id, method, params });
          });
        }

        function applyHostContext(context) {
          if (context?.theme === 'light' || context?.theme === 'dark') {
            document.documentElement.dataset.theme = context.theme;
          }
          onHostContext?.(context);
        }

        window.addEventListener('message', event => {
          const data = event.data;
          if (closed || event.source !== window.parent || data?.jsonrpc !== '2.0') return;
          if (data.method === 'ui/resource-teardown') {
            closed = true;
            for (const entry of pending.values()) {
              clearTimeout(entry.timeout);
              entry.reject(new Error('View closed'));
            }
            pending.clear();
            onClosed?.();
            post({ id: data.id, result: {} });
            return;
          }
          if (data.method === 'ping') {
            post({ id: data.id, result: {} });
            return;
          }
          if (data.method === 'ui/notifications/host-context-changed') {
            applyHostContext(data.params);
            return;
          }
          if (data.method === 'ui/notifications/tool-result') {
            onToolResult?.(data.params);
            return;
          }
          if (data.method === 'ui/notifications/tool-cancelled') {
            onToolResult?.(null);
            return;
          }
          if (data.method || !pending.has(data.id)) return;
          const entry = pending.get(data.id);
          clearTimeout(entry.timeout);
          pending.delete(data.id);
          if (data.error || !Object.hasOwn(data, 'result')) {
            const error = new Error('Host request failed');
            if (Number.isInteger(data.error?.code)) error.code = data.error.code;
            entry.reject(error);
          } else {
            entry.resolve(data.result);
          }
        });

        return {
          get closed() { return closed; },
          request,
          notify(method, params) { post({ method, params }); },
          async initialize(appName, mode) {
            const host = await request('ui/initialize', {
              protocolVersion: '2026-01-26',
              appInfo: { name: appName, version: '1.0.0' },
              appCapabilities: { availableDisplayModes: [mode] },
            });
            applyHostContext(host?.hostContext);
            post({ method: 'ui/notifications/initialized' });
            return host?.hostCapabilities || {};
          },
        };
      }
`

export const sociusActivityHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Activity | SociusFit</title>
  <style>
    :root {
      color-scheme: light dark;
      --background: light-dark(#ffffff, #20272b);
      --foreground: light-dark(#202824, #f1f4f2);
      --muted: light-dark(#58665f, #aab8b1);
      --line: light-dark(#dce2dd, #364047);
      --accent: light-dark(#216b55, #84dbc2);
    }
    :root[data-theme="light"] { color-scheme: light; }
    :root[data-theme="dark"] { color-scheme: dark; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--foreground);
      font: 1rem/1.5 system-ui, sans-serif;
      overflow-wrap: anywhere;
    }
    main { padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; }
    h1, h2, h3, p { margin: 0; }
    h1 { color: var(--accent); font-size: 1.25rem; }
    h2 { font-size: 1.05rem; }
    h3 { font-size: 1rem; }
    #inline-status { margin-top: .35rem; }
    .muted, time { color: var(--muted); }
    .section-note { margin-top: .4rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    .entry { border-top: 1px solid var(--line); margin-top: .65rem; padding-top: .65rem; }
    .entry-state { color: var(--accent); font-weight: 600; }
${activityStyles}
  </style>
</head>
<body>
  <main>
    <h1>SociusFit Activity</h1>
    <p id="inline-status" class="muted" role="status">Loading saved activity…</p>
${activityCardMarkup}
  </main>
  <script>
    (() => {
${activityRendererScript}
${mcpHostBridgeScript}
      const status = document.getElementById('inline-status');
      let waiting;
      let resizeObserver;
      let resultReceived = false;
      function showError() {
        document.getElementById('activity-card').hidden = true;
        status.textContent = 'Saved activity is unavailable in this view.';
      }
      const host = createMcpHostBridge({
        onToolResult(result) {
          resultReceived = true;
          clearTimeout(waiting);
          try {
            if (result?.isError) throw new Error('Tool call failed');
            renderActivity(result?._meta?.activity);
            status.textContent = '';
          } catch {
            showError();
          }
        },
        onClosed() {
          clearTimeout(waiting);
          resizeObserver?.disconnect();
        },
      });
      if (window.parent === window) {
        showError();
      } else {
        void host.initialize('SociusFit Activity', 'inline').then(() => {
          if (host.closed) return;
          if (!resultReceived) waiting = setTimeout(showError, 15000);
          if (typeof ResizeObserver === 'function') {
            const content = document.querySelector('main');
            resizeObserver = new ResizeObserver(() => {
              const { width, height } = content.getBoundingClientRect();
              host.notify('ui/notifications/size-changed', { width: Math.ceil(width), height: Math.ceil(height) });
            });
            resizeObserver.observe(content);
          }
        }).catch(() => {
          if (!host.closed && !resultReceived) showError();
        });
      }
    })();
  </script>
</body>
</html>`
