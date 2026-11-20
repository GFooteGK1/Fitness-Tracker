export const nutritionStyles = String.raw`
    #nutrition-card { display: grid; gap: .65rem; }
    #nutrition-progress { display: grid; gap: .85rem; margin-block: .35rem; }
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
        if (!nutrition || !mealStatuses.includes(nutrition.mealStatus)
          || !targetStatuses.includes(nutrition.targetStatus)
          || (nutrition.mealStatus !== 'unavailable' && !validMacros(nutrition.totals, false))
          || (nutrition.targetStatus === 'available' && !validMacros(nutrition.targets, true))) {
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

        const entries = macros.map(([key, label, unit]) => {
          const logged = nutrition.mealStatus === 'unavailable' ? null : nutrition.totals[key];
          const target = nutrition.targetStatus === 'available' ? nutrition.targets[key] : null;
          const unitValue = value => format.format(value) + ' ' + unit;
          const row = document.createElement('li');
          row.className = 'nutrition-macro';
          const header = document.createElement('div');
          header.className = 'nutrition-macro-heading';
          const title = document.createElement('h3');
          title.textContent = label;
          const values = document.createElement('p');
          const loggedLabel = nutrition.mealStatus === 'partial' ? ' subtotal' : ' logged';
          values.textContent = [logged === null ? null : unitValue(logged) + loggedLabel,
            target === null ? null : unitValue(target) + ' target'].filter(Boolean).join(' / ');
          header.append(title, values);
          row.append(header);
          if (logged !== null && target !== null) {
            const progress = document.createElement('progress');
            progress.max = target;
            progress.value = Math.min(logged, target);
            progress.setAttribute('aria-label', label + ' progress');
            progress.setAttribute('aria-valuetext', values.textContent);
            row.append(progress);
          }
          return row;
        });
        document.getElementById('nutrition-progress').replaceChildren(...entries);
        document.getElementById('nutrition-card').hidden = false;
      }
`
