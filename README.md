# maketzo-frontend

Static site for `maketzo.co` — landing pages, marketing detail pages, and the auth surface served outside the Node API.

## Deploy

Hostinger Git Deploy from this repo's `main` branch directly into `~/domains/maketzo.co/public_html/` on the shared host. Push to `main` → site updates automatically. No build step.

## Local preview

Open any `*.html` file with `file://`. Relative asset paths (`assets/...`) work without a server. See [feedback-relative-asset-paths](../memory) for why we don't use leading slashes.

## What lives here

- `*.html` — every public page (`index`, `system`, `edge`, `focus`, `journal`, `pricing`, `why`, `contact`, `privacy`, `terms`, `disclaimer`) + the auth pages (`login`, `signup`, `forgot-password`, `reset-password`, `verify-email`).
- `assets/css/` — design tokens, components, page-specific CSS. **Source of truth is `design-system/`** (lives outside this repo); CSS here is the mechanically-copied build output. Do not edit `tokens.css` here directly.
- `assets/*.png|webp|avif|jpg` — hero photos + logo marks. Heroes are pre-optimized triplets (avif/webp/png).
- `.htaccess` — clean-URL rewrites (e.g. `/system` → `system.html`).

## What does NOT live here

- The Node API + auth handlers — those live in `maketzo-backend` and serve at `api.maketzo.co`.
- The design-system source — separate workspace; this repo only holds the published CSS bundle.
