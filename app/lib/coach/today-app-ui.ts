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
    #load-error { color: var(--danger); background: var(--danger-soft); }
    footer { color: var(--muted); }
    @media (min-width: 42rem) {
      main { padding-inline: 1.75rem; padding-block: 2rem; }
      .secondary { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="brand">SociusFit</p>
      <h1>Today</h1>
      <time id="today-date" hidden></time>
    </header>
    <p id="loading" class="muted" role="status">Loading your saved training…</p>
    <section id="load-error" class="panel" hidden>
      <p id="error-message" role="alert"></p>
      <button id="retry" type="button">Try again</button>
    </section>
    <div id="today-content" hidden>
      <section class="panel session-panel" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Today's plan</h2>
        <p id="sessions-note" class="muted section-note" hidden></p>
        <ul id="sessions"></ul>
        <button id="ask" type="button" hidden>Ask about today</button>
        <p id="ask-status" class="muted" role="status"></p>
      </section>
      <div class="secondary">
        <section class="panel" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent training</h2>
          <p id="recent-note" class="muted section-note" hidden></p>
          <ul id="recent"></ul>
        </section>
        <section class="panel" aria-labelledby="recovery-title">
          <h2 id="recovery-title">Recovery</h2>
          <p id="recovery-status" class="recovery-state"></p>
          <p id="recovery-note" class="muted status-label" hidden></p>
          <dl id="recovery-dates"></dl>
        </section>
      </div>
      <footer>Read from SociusFit <time id="read-at"></time></footer>
    </div>
  </main>
  <script>
    (() => {
      const byId = id => document.getElementById(id);
      const pending = new Map();
      const ask = byId('ask');
      let requestId = 0;
      let capabilities = null;
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

      function applyTheme(context) {
        if (context?.theme === 'light' || context?.theme === 'dark') {
          document.documentElement.dataset.theme = context.theme;
        }
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
          post({ id: data.id, result: {} });
          return;
        }
        if (data.method === 'ping') {
          post({ id: data.id, result: {} });
          return;
        }
        if (data.method === 'ui/notifications/host-context-changed') {
          applyTheme(data.params);
          return;
        }
        if (data.method || !pending.has(data.id)) return;
        const entry = pending.get(data.id);
        clearTimeout(entry.timeout);
        pending.delete(data.id);
        if (data.error || !Object.hasOwn(data, 'result')) {
          entry.reject(new Error('Host request failed'));
        } else {
          entry.resolve(data.result);
        }
      });

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

      function renderSessions(today) {
        const statusLabels = { planned: 'Planned', completed: 'Completed', skipped: 'Skipped' };
        const labels = {
          none: 'No saved session for today.',
          unavailable: 'The saved plan is currently unavailable.',
        };
        setNote('sessions-note', labels[today.sessionStatus]);
        byId('sessions').replaceChildren(...today.sessions.map(session => {
          const item = element('li', null, 'entry');
          const heading = element('div', null, 'entry-heading');
          heading.append(element('h3', session.title || 'Training session'));
          if (statusLabels[session.status]) {
            heading.append(element('span', statusLabels[session.status], 'entry-state'));
          }
          item.append(heading);
          if (session.focus) item.append(element('p', session.focus, 'muted'));
          return item;
        }));
      }

      function renderRecent(today) {
        const labels = {
          partial: 'Some recent training details are unavailable.',
          empty: 'No recent movements in the saved training records.',
          unavailable: 'Recent training is currently unavailable.',
        };
        setNote('recent-note', labels[today.recentStatus]);
        byId('recent').replaceChildren(...today.recentWork.map(work => {
          const item = element('li', null, 'entry');
          item.append(element('h3', work.name));
          const date = element('time');
          if (setTime(date, work.date, true)) item.append(date);
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
        };
        const state = byId('recovery-status');
        state.textContent = labels[recovery.status] || 'Unavailable';
        state.dataset.state = recovery.status;
        setNote('recovery-note', recovery.status === 'stale' ? 'Recovery data may be out of date.' : null);
        const dates = byId('recovery-dates');
        dates.replaceChildren();
        for (const [label, value, dateOnly] of [
          ['Stored recovery date', recovery.storedDate, true],
          ['Last sync', recovery.lastSyncAt, false],
        ]) {
          const time = element('time');
          if (!setTime(time, value, dateOnly)) continue;
          const row = element('div');
          const detail = element('dd');
          detail.append(time);
          row.append(element('dt', label), detail);
          dates.append(row);
        }
      }

      function render(today) {
        if (!today || !Array.isArray(today.sessions) || !Array.isArray(today.recentWork) || !today.recovery) {
          throw new Error('Today result missing');
        }
        const date = byId('today-date');
        date.hidden = !setTime(date, today.date, true);
        renderSessions(today);
        renderRecent(today);
        renderRecovery(today.recovery);
        const readAt = byId('read-at');
        readAt.hidden = !setTime(readAt, today.readAt, false);
        ask.hidden = !capabilities?.message?.text;
        byId('today-content').hidden = false;
      }

      function showError(message, canRetry = true) {
        byId('error-message').textContent = message;
        byId('load-error').hidden = false;
        byId('retry').hidden = !canRetry;
      }

      async function loadToday() {
        const retry = byId('retry');
        if (retry.disabled || closed) return;
        retry.disabled = true;
        byId('load-error').hidden = true;
        byId('error-message').textContent = '';
        byId('today-content').hidden = true;
        byId('today-date').hidden = true;
        byId('loading').hidden = false;
        try {
          if (window.parent === window) {
            showError('Open SociusFit from ChatGPT to view your saved training.', false);
            return;
          }
          if (!capabilities) {
            const host = await request('ui/initialize', {
              protocolVersion: '2026-01-26',
              appInfo: { name: 'SociusFit Today', version: '1.0.0' },
              appCapabilities: { availableDisplayModes: ['fullscreen'] },
            });
            applyTheme(host?.hostContext);
            capabilities = host?.hostCapabilities || {};
            post({ method: 'ui/notifications/initialized' });
          }
          const result = await request('tools/call', {
            name: 'open_socius_today',
            arguments: { tzOffset: new Date().getTimezoneOffset() },
          });
          if (result?.isError) {
            const reconnect = result._meta?.['mcp/www_authenticate'];
            showError(reconnect ? 'Reconnect SociusFit in ChatGPT, then try again.' : 'Your saved training is temporarily unavailable.');
            return;
          }
          render(result?._meta?.today);
        } catch {
          if (!closed) showError('Could not load your saved training. Try again to reconnect to the view.');
        } finally {
          retry.disabled = false;
          byId('loading').hidden = true;
        }
      }

      ask.addEventListener('click', async () => {
        if (closed || !capabilities?.message?.text || ask.disabled) return;
        const status = byId('ask-status');
        ask.disabled = true;
        status.textContent = '';
        const canDraft = Boolean(capabilities.experimental?.['openai/message']);
        try {
          const result = await request('ui/message', {
            role: 'user',
            content: [{ type: 'text', text: 'Use my saved SociusFit context to explain what I should train today. Keep this read-only.' }],
            ...(canDraft ? { _meta: { 'openai/message': { target: 'new', send: false } } } : {}),
          });
          if (result?.isError) throw new Error('Chat unavailable');
          status.textContent = canDraft ? 'Draft opened in ChatGPT.' : 'Sent to ChatGPT.';
        } catch {
          if (!closed) status.textContent = 'Could not open the question. You can ask in the ChatGPT composer.';
        } finally {
          ask.disabled = false;
        }
      });

      byId('retry').addEventListener('click', loadToday);
      void loadToday();
    })();
  </script>
</body>
</html>`
