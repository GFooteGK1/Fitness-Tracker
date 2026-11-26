export const nutritionStyles = String.raw`
    #nutrition-card { display: grid; gap: .65rem; }
    #nutrition-progress, #nutrition-week-progress { display: grid; gap: .85rem; margin-block: .35rem; }
    .nutrition-macro { display: grid; min-width: 0; gap: .25rem; }
    .nutrition-macro progress {
      width: 100%;
      height: .75rem;
      accent-color: var(--accent);
    }
    .nutrition-macro-heading {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: .25rem .65rem;
    }
    #nutrition-read-at { display: block; }
    #nutrition-week { border: 1px solid var(--line); border-radius: .7rem; }
    #nutrition-week > summary {
      min-height: 44px;
      padding: .65rem .75rem;
      font-weight: 650;
      cursor: pointer;
    }
    #nutrition-week > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    #nutrition-week[open] > summary { border-bottom: 1px solid var(--line); }
    #nutrition-week-content { display: grid; gap: .65rem; padding: .75rem; }
    #nutrition-log { margin-bottom: .65rem; }
    #meal-chat { display: grid; gap: .65rem; margin-bottom: 1rem; }
    #meal-chat label { display: block; margin-bottom: .3rem; }
    #meal-chat textarea {
      width: 100%;
      min-height: 5rem;
      padding: .55rem .65rem;
      border: 1px solid var(--line);
      border-radius: .6rem;
      background: var(--surface);
      color: var(--foreground);
      font: inherit;
      font-size: max(1rem, 16px);
      resize: vertical;
    }
    #meal-chat textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    .meal-chat-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
`

export const nutritionCardMarkup = String.raw`
    <div id="nutrition-card" hidden>
      <time id="nutrition-date" class="muted"></time>
      <p id="nutrition-meal-count" class="muted" hidden></p>
      <ul id="nutrition-progress" aria-label="Nutrition progress"></ul>
      <p id="nutrition-meal-note" class="muted" hidden></p>
      <p id="nutrition-target-note" class="muted" hidden></p>
      <p class="muted">Totals reflect saved meals. Full-day intake is unknown.</p>
      <time id="nutrition-read-at" class="muted"></time>
      <details id="nutrition-week" hidden>
        <summary>Week to date</summary>
        <div id="nutrition-week-content">
          <p id="nutrition-week-range" class="muted" hidden></p>
          <p id="nutrition-week-coverage" class="muted" hidden></p>
          <p id="nutrition-week-basis" class="muted" hidden></p>
          <ul id="nutrition-week-progress" aria-label="Week-to-date nutrition progress"></ul>
          <p id="nutrition-week-meal-note" class="muted" hidden></p>
          <p id="nutrition-week-target-note" class="muted" hidden></p>
        </div>
      </details>
    </div>
`

export const mealChatMarkup = String.raw`
    <section id="meal-chat" class="panel" aria-labelledby="meal-chat-title" hidden>
      <h2 id="meal-chat-title">Log food in chat</h2>
      <div>
        <label for="meal-chat-details">What did you eat? (optional)</label>
        <textarea id="meal-chat-details" rows="3" aria-describedby="meal-chat-help"></textarea>
      </div>
      <p id="meal-chat-help" class="muted">You can add a photo or dictate in the ChatGPT composer.</p>
      <div class="meal-chat-actions">
        <button id="meal-chat-open" type="button">Prepare chat draft</button>
        <button id="meal-chat-close" class="secondary-action" type="button">Close meal draft</button>
      </div>
      <p id="meal-chat-status" class="muted" role="status"></p>
    </section>
`

export const mealChatScript = String.raw`
      function setupMealChat(host, byId) {
        const launcher = byId('nutrition-log');
        const panel = byId('meal-chat');
        const details = byId('meal-chat-details');
        const open = byId('meal-chat-open');
        const close = byId('meal-chat-close');
        const status = byId('meal-chat-status');
        const composerInstructions = 'Open SociusFit from the side panel of your conversation, or log the meal directly in that chat.';
        let supportsEditableDraft = false;

        function resetFeedback() {
          open.disabled = false;
          status.textContent = '';
        }

        launcher.addEventListener('click', () => {
          if (launcher.hidden) return;
          panel.hidden = false;
          launcher.setAttribute('aria-expanded', 'true');
          details.focus();
        });
        close.addEventListener('click', () => {
          panel.hidden = true;
          launcher.setAttribute('aria-expanded', 'false');
          details.readOnly = false;
          details.value = '';
          resetFeedback();
          const returnFocus = launcher.closest('[hidden]') ? document.querySelector('.view-switch [aria-pressed="true"]') : launcher;
          returnFocus?.focus();
        });
        details.addEventListener('input', () => {
          if (!details.readOnly) resetFeedback();
        });

        open.addEventListener('click', async () => {
          if (host.closed || panel.hidden || open.disabled) return;
          if (!supportsEditableDraft) {
            status.textContent = composerInstructions;
            return;
          }
          const meal = details.value.trim();
          const prompt = 'I want to log food I ate. Use the details I include. Ask for any required details that are missing, then save the meal in SociusFit and confirm the save.'
            + (meal ? '\n\n' + meal : '');
          open.disabled = true;

          // The host appends to the composer. Keep each attempt to one append, even if the acknowledgment is lost.
          details.readOnly = true;
          close.disabled = true;
          status.textContent = 'Preparing your draft in the active ChatGPT conversation…';
          try {
            const result = await host.request('ui/message', {
              role: 'user',
              content: [{ type: 'text', text: prompt }],
              _meta: { 'openai/message': { target: 'active', send: false } },
            });
            if (!result || typeof result !== 'object' || Array.isArray(result) || result.isError) {
              throw new Error('Draft request was not acknowledged');
            }
            status.textContent = 'Review, edit, and send your draft in the ChatGPT composer.';
          } catch {
            status.textContent = 'Check the ChatGPT composer for the draft. If it is missing, log the meal directly in that chat.';
          } finally {
            close.disabled = false;
          }
        });

        return {
          setAvailable(available) {
            launcher.hidden = !available;
            if (!available && !panel.hidden) {
              panel.hidden = true;
              launcher.setAttribute('aria-expanded', 'false');
            }
          },
          setCapabilities(capabilities) {
            supportsEditableDraft = Boolean(capabilities.message?.text && capabilities.experimental?.['openai/message']);
          },
        };
      }
`

export const nutritionRendererScript = String.raw`
      function renderNutrition(nutrition) {
        const macros = [
          ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'],
          ['fat', 'Fat', 'g'], ['calories', 'Calories', 'kcal'],
        ];
        const validMacros = (values, isTarget) => values && macros.every(([key]) =>
          Number.isFinite(values[key]) && (isTarget ? values[key] > 0 : values[key] >= 0));
        const mealStatuses = ['available', 'no_records', 'partial', 'unavailable'];
        const targetStatuses = ['available', 'not_configured', 'unavailable'];
        const validSummary = summary => summary && mealStatuses.includes(summary.mealStatus)
          && targetStatuses.includes(summary.targetStatus)
          && (summary.mealStatus === 'unavailable' || validMacros(summary.totals, false))
          && (summary.targetStatus !== 'available' || validMacros(summary.targets, true));
        if (!validSummary(nutrition)) {
          throw new Error('Nutrition results are unavailable');
        }
        const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
        const date = document.getElementById('nutrition-date');
        date.dateTime = nutrition.date;
        date.textContent = new Intl.DateTimeFormat(undefined, {
          weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
        }).format(new Date(nutrition.date + 'T12:00:00Z'));
        const checked = document.getElementById('nutrition-read-at');
        const readTime = new Date(nutrition.readAt);
        checked.dateTime = nutrition.readAt;
        checked.textContent = 'Last checked ' + new Intl.DateTimeFormat(undefined, {
          hour: 'numeric', minute: '2-digit', timeZone: nutrition.timezone,
        }).format(readTime);

        const setText = (id, value) => {
          const element = document.getElementById(id);
          element.textContent = value;
          element.hidden = !value;
        };
        const count = nutrition.mealCount;
        setText('nutrition-meal-count', Number.isSafeInteger(count) && count >= 0
          ? count + (count === 1 ? ' saved meal' : ' saved meals') : '');
        const mealNotes = {
          partial: 'Showing a subtotal. Some saved meals or macro values are unavailable.',
          unavailable: 'Logged macro totals are unavailable.',
        };
        const targetNotes = {
          not_configured: 'No macro targets are set.',
          unavailable: 'Macro targets are unavailable.',
        };
        setText('nutrition-meal-note', mealNotes[nutrition.mealStatus] || '');
        setText('nutrition-target-note', targetNotes[nutrition.targetStatus] || '');

        const renderRows = (summary, id, weekly = false) => {
          const entries = macros.map(([key, label, unit]) => {
            const logged = summary.mealStatus === 'unavailable' ? null : summary.totals[key];
            const target = summary.targetStatus === 'available' ? summary.targets[key] : null;
            const unitValue = value => format.format(value) + ' ' + unit;
            const row = document.createElement('li');
            row.className = 'nutrition-macro';
            const header = document.createElement('div');
            header.className = 'nutrition-macro-heading';
            const title = document.createElement('h3');
            title.textContent = label;
            const values = document.createElement('p');
            const loggedLabel = summary.mealStatus === 'partial' ? ' subtotal' : ' logged';
            const canCompare = logged !== null && target !== null && (!weekly || summary.mealStatus !== 'partial');
            const percent = weekly && canCompare ? logged / target * 100 : null;
            const comparison = Number.isFinite(percent) ? ' · ' + format.format(percent) + '%' : '';
            values.textContent = [logged === null ? (weekly ? '— logged' : null) : unitValue(logged) + loggedLabel,
              target === null ? (weekly ? '— target' : null) : unitValue(target) + ' target'].filter(Boolean).join(' / ') + comparison;
            header.append(title, values);
            row.append(header);
            if (canCompare && (!weekly || Number.isFinite(percent))) {
              const progress = document.createElement('progress');
              progress.max = target;
              progress.value = Math.min(logged, target);
              progress.setAttribute('aria-label', label + (weekly ? ' week-to-date progress' : ' progress'));
              progress.setAttribute('aria-valuetext', values.textContent);
              row.append(progress);
            }
            return row;
          });
          document.getElementById(id).replaceChildren(...entries);
        };
        renderRows(nutrition, 'nutrition-progress');
        const details = document.getElementById('nutrition-week');
        const week = nutrition.weekToDate;
        details.hidden = week === undefined;
        if (week !== undefined) {
          const formatDay = new Intl.DateTimeFormat(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
          });
          const start = new Date(week?.startDate + 'T00:00:00Z');
          const end = new Date(week?.endDate + 'T00:00:00Z');
          const validRange = Number.isFinite(start.valueOf()) && Number.isFinite(end.valueOf())
            && start.toISOString().slice(0, 10) === week?.startDate && end.toISOString().slice(0, 10) === week?.endDate
            && week.endDate === nutrition.date && start.getUTCDay() === 1
            && Number.isInteger(week.days) && week.days >= 1 && week.days <= 7
            && end - start === (week.days - 1) * 86400000;
          const validCoverage = week?.mealStatus === 'available'
            ? Number.isInteger(week.loggedDays) && week.loggedDays > 0 && week.loggedDays <= week.days
            : week?.mealStatus === 'no_records' ? week.loggedDays === 0 : week?.loggedDays === null;
          if (validSummary(week) && validRange && validCoverage) {
            setText('nutrition-week-range', formatDay.format(start) + (week.days === 1 ? '' : ' – ' + formatDay.format(end)));
            const elapsed = week.days + (week.days === 1 ? ' day' : ' days');
            setText('nutrition-week-coverage', week.loggedDays === null ? 'Logged-day coverage is unavailable.'
              : week.loggedDays + ' of ' + elapsed + ' with saved meals.');
            setText('nutrition-week-basis', 'Current daily targets × ' + elapsed + '.');
            setText('nutrition-week-meal-note', mealNotes[week.mealStatus] || '');
            setText('nutrition-week-target-note', targetNotes[week.targetStatus] || '');
            renderRows(week, 'nutrition-week-progress', true);
          } else {
            setText('nutrition-week-range', '');
            setText('nutrition-week-coverage', '');
            setText('nutrition-week-basis', '');
            setText('nutrition-week-target-note', '');
            setText('nutrition-week-meal-note', 'Week-to-date nutrition is unavailable.');
            document.getElementById('nutrition-week-progress').replaceChildren();
          }
        }
        document.getElementById('nutrition-card').hidden = false;
      }
`
