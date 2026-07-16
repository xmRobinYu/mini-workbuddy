/**
 * Standalone HTML rendered by the Worker when the SSR entry itself fails.
 * It cannot import the app's Tailwind tokens, so we mirror the design-token
 * palette here and switch via `prefers-color-scheme` to stay consistent
 * with the in-app light/dark themes.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bg: #fbfbfd;
        --fg: #24262e;
        --muted: #5c6272;
        --card: #ffffff;
        --border: #e6e7eb;
        --brand: #2f5bd8;
        --brand-fg: #fbfbfd;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #1c1e26;
          --fg: #ececee;
          --muted: #a9adb8;
          --card: #24262e;
          --border: rgba(255, 255, 255, 0.12);
          --brand: #7fa1f2;
          --brand-fg: #1c1e26;
        }
      }
      body {
        font: 15px/1.5 "DM Sans", system-ui, -apple-system, sans-serif;
        background: var(--bg);
        color: var(--fg);
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2rem;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: var(--fg); }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
        font: inherit;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
      }
      .primary { background: var(--brand); color: var(--brand-fg); }
      .secondary { background: transparent; color: var(--fg); border-color: var(--border); }
      .secondary:hover { background: var(--bg); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
