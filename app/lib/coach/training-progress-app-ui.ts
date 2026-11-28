export const trainingRecordsOrigin = 'https://www.sociusfit.com'

export const trainingProgressStyles = String.raw`
    #training-progress h3, #training-progress h4 { margin: 0; }
    #training-progress .progress-subsection { border-top: 1px solid var(--line); margin-top: .9rem; padding-top: .9rem; }
    .progress-workout-counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
    .progress-workout-counts dd { color: var(--accent); font-size: 1.75rem; font-weight: 650; }
    .progress-mix > div, .progress-record { display: flex; justify-content: space-between; gap: .75rem; }
    .progress-record { align-items: start; border-bottom: 1px solid var(--line); padding-block: .7rem; overflow-wrap: anywhere; }
    .progress-record-result { text-align: end; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
    .progress-record-result strong { display: block; color: var(--accent); }
    .progress-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .9rem; }
`

export const trainingProgressMarkup = String.raw`
    <details id="training-progress" class="socius-card">
      <summary><h2>Training progress</h2></summary>
      <div class="socius-card-body">
        <p id="training-progress-status" class="muted" role="status" hidden></p>
        <div id="training-progress-content" hidden>
          <section aria-labelledby="training-summary-title">
            <h3 id="training-summary-title">Training summary</h3>
            <p id="progress-workout-note" class="muted section-note" hidden></p>
            <dl id="progress-workout-counts" class="progress-workout-counts" hidden>
              <div><dt id="progress-month-label"></dt><dd id="progress-month-workouts"></dd></div>
              <div><dt>Workouts all time</dt><dd id="progress-all-workouts"></dd></div>
            </dl>
            <div id="progress-mix" class="progress-subsection" hidden>
              <h4>Training mix <span class="muted">· All time</span></h4>
              <dl class="progress-mix">
                <div><dt>Strength</dt><dd id="progress-strength"></dd></div>
                <div><dt>Metcons</dt><dd id="progress-metcons"></dd></div>
                <div><dt>Cardio</dt><dd id="progress-cardio"></dd></div>
              </dl>
              <p class="muted section-note">A mixed workout can count in more than one category.</p>
            </div>
          </section>
          <section class="progress-subsection" aria-labelledby="training-records-title">
            <h3 id="training-records-title">Recent personal records</h3>
            <p id="progress-record-count" class="muted section-note" hidden></p>
            <p id="progress-record-note" class="muted section-note" hidden></p>
            <ul id="progress-recent-records"></ul>
          </section>
        </div>
        <div class="progress-actions">
          <button id="training-progress-refresh" class="secondary-action" type="button" hidden>Refresh progress</button>
          <button id="training-records-link" class="secondary-action" type="button" hidden>View all records on SociusFit</button>
        </div>
        <p id="training-records-link-status" class="muted section-note" role="status" hidden></p>
      </div>
    </details>
`

export const trainingProgressScript = String.raw`
      function setupTrainingProgress(host, timezone) {
        const panel = byId('training-progress');
        const content = byId('training-progress-content');
        const refresh = byId('training-progress-refresh');
        const recordsLink = byId('training-records-link');
        const recordsUrl = '${trainingRecordsOrigin}/pr-history';
        const number = new Intl.NumberFormat();
        const recordDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
        let supportsOpenLink = false;

        function renderProgress(progress) {
          if (progress?.timezone !== timezone || !progress.records) throw new Error('Progress result missing');
          const { workouts, records } = progress;
          byId('progress-workout-counts').hidden = !workouts;
          byId('progress-mix').hidden = !workouts?.totalWorkouts;
          setNote('progress-workout-note', !workouts ? 'Your training summary could not load.'
            : workouts.totalWorkouts === 0 ? 'Your first logged workout starts the picture.' : '');
          if (workouts) {
            byId('progress-month-label').textContent = 'Workouts in ' + workouts.currentMonth;
            for (const [id, value] of Object.entries({
              'progress-month-workouts': workouts.monthToDate,
              'progress-all-workouts': workouts.totalWorkouts,
              'progress-strength': workouts.strengthSessions,
              'progress-metcons': workouts.metcons,
              'progress-cardio': workouts.cardio,
            })) byId(id).textContent = number.format(value);
          }

          setNote('progress-record-count', records.monthCount === null ? 'This month’s improvement count is unavailable.'
            : records.monthCount > 0
              ? number.format(records.monthCount) + (records.monthCount === 1 ? ' improvement this month' : ' improvements this month') : '');
          setNote('progress-record-note', !Array.isArray(records.entries) ? 'Your recent personal records could not load.'
            : records.entries.length === 0 ? 'Your first results establish a baseline. Improvements will appear here.' : '');
          byId('progress-recent-records').replaceChildren(...(records.entries ?? []).map(record => {
            const item = element('li', null, 'progress-record');
            const label = element('div');
            label.append(element('strong', record.exercise), element('p', record.type, 'muted'));
            const value = element('div', null, 'progress-record-result');
            const time = element('time', recordDate.format(new Date(record.date + 'T12:00:00Z')));
            time.dateTime = record.date;
            value.append(element('strong', record.value), time);
            item.append(label, value);
            return item;
          }));
          content.hidden = false;
        }

        async function loadProgress() {
          if (!panel.open || host.closed || refresh.disabled) return;
          refresh.disabled = true;
          content.setAttribute('aria-busy', 'true');
          setNote('training-progress-status', 'Loading your training progress…');
          try {
            const result = await host.request('tools/call', { name: 'read_socius_training_progress', arguments: { timezone } });
            if (host.closed) return;
            if (result?.isError) throw new Error('Progress read failed');
            renderProgress(result?._meta?.progress);
            setNote('training-progress-status', '');
            refresh.textContent = 'Refresh progress';
          } catch (error) {
            if (host.closed) return;
            content.hidden = true;
            setNote('training-progress-status', error?.code === -32602
              ? 'Refresh tools in SociusFit’s ChatGPT settings, then reopen the app.'
              : 'Your training progress could not load.');
            refresh.textContent = 'Try again';
          } finally {
            refresh.disabled = false;
            refresh.hidden = false;
            content.removeAttribute('aria-busy');
          }
        }

        panel.addEventListener('toggle', loadProgress);
        refresh.addEventListener('click', loadProgress);
        recordsLink.addEventListener('click', async () => {
          if (host.closed || recordsLink.hidden || recordsLink.disabled) return;
          recordsLink.disabled = true;
          setNote('training-records-link-status', '');
          try {
            if (typeof window.openai?.openExternal === 'function') {
              await window.openai.openExternal({ href: recordsUrl });
            } else if (supportsOpenLink) {
              const result = await host.request('ui/open-link', { url: recordsUrl });
              if (result?.isError) throw new Error('Records link could not open');
            }
          } catch {
            if (!host.closed) setNote('training-records-link-status', 'Could not open your records.');
          } finally {
            recordsLink.disabled = false;
          }
        });

        return {
          setCapabilities(capabilities) {
            supportsOpenLink = Boolean(capabilities.openLinks);
            recordsLink.hidden = !supportsOpenLink && typeof window.openai?.openExternal !== 'function';
          },
        };
      }
`
