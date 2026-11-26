export const sociusThemeStyles = String.raw`
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
`

export const sociusCardStyles = String.raw`
    .socius-card {
      --card-padding: clamp(1rem, 3vw, 1.5rem);
      min-width: 0;
      margin: 0 0 1rem;
      padding: var(--card-padding);
      border: 1px solid var(--line);
      border-top: .25rem solid var(--accent);
      border-radius: 1.1rem;
      background: var(--surface);
    }
    details.socius-card { padding: 0; }
    .socius-card > summary {
      display: flex;
      align-items: center;
      gap: .6rem;
      min-height: 44px;
      padding: var(--card-padding);
      border-radius: inherit;
      cursor: pointer;
      list-style: none;
      touch-action: manipulation;
    }
    .socius-card > summary > :is(h1, h2) {
      margin: 0;
      font-size: 1.15rem;
      letter-spacing: -.02em;
    }
    .socius-card > summary::-webkit-details-marker { display: none; }
    .socius-card > summary::after {
      content: '';
      flex: 0 0 .55rem;
      height: .55rem;
      margin-inline: auto .2rem;
      border: solid var(--accent);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .socius-card[open] > summary::after { transform: rotate(225deg); }
    .socius-card > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    .socius-card-body { padding: 0 var(--card-padding) var(--card-padding); }
`
