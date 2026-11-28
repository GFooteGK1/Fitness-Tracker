export const nutritionStyles = String.raw`
    #nutrition-card { margin-top: .9rem; }
    #nutrition-card .socius-card-body { display: grid; gap: .65rem; }
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
`

export const nutritionCardMarkup = String.raw`
    <div id="nutrition-card" hidden>
      <details id="nutrition-daily" class="socius-card" open>
        <summary><h2>Daily totals</h2></summary>
        <div class="socius-card-body">
          <time id="nutrition-date" class="muted"></time>
          <p id="nutrition-meal-count" class="muted" hidden></p>
          <ul id="nutrition-progress" aria-label="Nutrition progress"></ul>
          <p id="nutrition-meal-note" class="muted" hidden></p>
          <p id="nutrition-target-note" class="muted" hidden></p>
          <p class="muted">Totals reflect saved meals. Full-day intake is unknown.</p>
          <time id="nutrition-read-at" class="muted"></time>
        </div>
      </details>
      <details id="nutrition-week" class="socius-card" hidden>
        <summary><h2>Week to date</h2></summary>
        <div id="nutrition-week-content" class="socius-card-body">
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
