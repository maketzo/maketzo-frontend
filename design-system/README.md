# Maketzo Design System

This folder is the **single source of truth** for all Maketzo visual elements.
Both the marketing site and the in-app product must conform to what's defined here.

When the strategic brand guide ([docs/maketzo_master_brand_style_guide.md](../docs/maketzo_master_brand_style_guide.md)) and the CSS tokens disagree, **the CSS wins** — the brand guide is strategic, the CSS is the implemented system.

---

## Folder Map

Flat structure — mirrors the source-of-truth zip produced by Claude Design. Future updates can be dropped in by overwriting files at the design-system root, no path translation needed.

```
design-system/
├── README.md                       # this file — orientation
├── Maketzo Design System.html      # master visual spec (browseable doc)
├── tokens.css                      # COLORS, TYPE, SPACING, RADII, MOTION (foundation)
├── system.css                      # layout shell + doc-page styles
├── components.css                  # .mk-* canonical components (btn, pill, card, banner, input, rule-gold)
├── strike.css                      # Strike System UI
├── chart.css                       # annotated chart UI
├── report.css                      # exported PDF / report layouts
├── document.css                    # PDF viewer + journal reading surfaces
├── capture.css                     # paste / drop / attachment UI
├── notify.css                      # toasts + transactional email shell
├── Marketing.html                  # reference design — marketing copy/treatment
├── App.html                        # reference design — app-shell treatment
├── tweaks-panel.jsx                # dev iteration panel — live-tweak nav/brand sizes in the browser (used by Marketing.html + App.html)
├── assets/                         # canonical brand assets
│   ├── logo-full.png
│   ├── logo-mark.png
│   ├── logo-wordmark.png
│   └── hero-trader.png             # marketing hero photograph
└── extension-prompts/              # specs for extending the system
    ├── README.md
    ├── add-document-experience-system.md
    ├── add-chart-and-report-system.md
    ├── add-capture-copy-paste-system.md
    └── add-strike-system-experience.md
```

**Reference HTML files** (`Marketing.html`, `App.html`, `Maketzo Design System.html`) are inspiration only — NOT prod. The production marketing site lives in `/public_html/`.

---

## How to Use

**For any HTML page (marketing or app):**

```html
<link rel="stylesheet" href="/design-system/tokens.css" />
<link rel="stylesheet" href="/design-system/components.css" />
<!-- Plus any subsystem CSS the page needs: strike, chart, capture, document, etc. -->
```

Reference role-mapped tokens (`--mk-surface-page`, `--mk-text-primary`, `--mk-brand`) in custom CSS — **not raw palette tokens** (`--mk-obsidian-900`). The role layer is what gives the app light-mode support.

---

## Core Principles (non-negotiable)

### Color
- **70% dark / 15% neutral / 10% gold / 5% functional.** Gold is signature, not decoration.
- State colors (profit / caution / warning / danger / lockin) are **semantic only**. Never decorative.
- Marketing is **dark-permanent**. Only the app supports light mode.
- **Light mode = DARK FONTS ONLY. No light/white fonts in light mode — ever.** (Ed directive, 2026-06-03.) In light mode every text element sits on a light surface, so it must be dark and legible. This is the failure mode to watch for: a component authored white-on-dark (hardcoded `rgba(255,255,255,…)` / `#fff` text) that *looks* fine because it never got a light-mode treatment. When it's finally seen in light mode the text washes out to invisible. **Prevention:** drive text color from role-mapped tokens (`--mk-text-primary`, `--mk-text-secondary`) that flip automatically — never hardcode white. **When a "dark hero" surface (e.g. the Status / verdict band) must invert for light mode, every nested element — eyebrows, pills/chips, +/- controls, severity-state text — needs an explicit `body.light-mode …` dark override, including per-`data-severity` variants** (the dark-mode severity rules out-specify a plain base override). A partial light treatment (headline-only) is worse than none — it ships an illegible card. Caught 2026-06-03 when the Status band's light treatment turned out to cover only the headline/subline.
- **Email is hybrid dark/light** (see "Email — Universal Shell" below). Inbox readability and email-client dark-mode-inversion compatibility win over brand-purity inside the reading card. Dark masthead + dark footer keep the MAKETZO identity bookending every send.

### Typography
- **Three fonts, three jobs.** No exceptions:
  - **Bebas Neue** → display, hero headlines, section titles, banner status (uppercase, tight tracking)
  - **DM Sans** → all body, UI, running text
  - **DM Mono** → P&L, tickers, timestamps, eyebrows, code

### Radii (three lanes, three intents)
- **Functional UI** (buttons, inputs, pills) → **sharp**, terminal-energy (4px / 6px / pill)
- **Containers** (cards, panels, modals) → **calm**, premium (10–20px)
- **Hero surfaces** → 24px

### Buttons
- `mk-btn--primary` — gold gradient, lifts on hover, **only one per view**
- `mk-btn--secondary` — gold border on transparent
- `mk-btn--ghost` — low-emphasis utility
- `mk-btn--util` — in-app calmer button (lowercase, smaller)

### Dividers (decorative section rules)
- `mk-rule-gold` — 1px gold gradient horizontal rule (default — signature section break)
- `mk-rule-gold--bold` — 2px brighter-center variant (use sparingly: final-CTA top edge, hero close)
- `mk-rule-gold--short` — width-capped variant (240px max, centered — for callouts)
Margins are NOT baked in — apply page-side spacing in the host stylesheet. Absolute positioning at a section's top edge is a host-stylesheet concern (e.g., `.section--accent-top .mk-rule-gold { position: absolute; top: 0; ... }`). Works on `<hr>` and `<div>`.

### Strike System
Strikes role-map to the canonical state ramp. **No new hexes.** Strikes are a behavioral driver of the state machine, not a separate palette.

### Edge & Pulse
Public visuals always abstract (`--mk-edge-wash`, `--mk-pulse-wash`). **Never disclose internals.** (Reinforces [CLAUDE.md § 3.2](../CLAUDE.md).)

### Voice (per brand guide)
50% calm & authoritative · 20% direct challenge · 20% inspirational · 10% analytical.
Avoid hype, exaggeration, guru language, flashiness.

### UI Philosophy
> **Cinematic at the top. Surgical below the fold.**
> Hero is immersive. Supporting sections are clean and conversion-focused. Product UI is calm, disciplined, legible.

---

## Email — Universal Shell

**Every automated email MAKETZO sends uses the same hybrid template — no per-template variation.** Standardized 2026-05-16 (Ed direction: visual consistency across all branded emails wins).

The canonical email shell lives at `maketzo-backend/auth-helpers.js` as `renderEmailShell({ heading, lead, bodyHtml, ctaUrl, ctaLabel, footnote, eyebrow, preheader })`. ALL senders go through it:

- Account: `sendVerifyEmail`, `sendResetPasswordEmail`, `sendMagicLinkEmail`, `sendExistingAccountEmail`
- Subscription: `sendWelcomeEmail` (Stripe post-checkout, in `server.js`)
- Newsletter: `sendNewsletterWelcomeEmail` (signup welcome) + `composeIssueHtml` (each bi-weekly issue)
- Reports: `runWeeklyReport` (Monday analytics digest, in `scripts/weekly-analytics-email.js`)

### Shell structure (top → bottom)

| Region | Background | Text | Purpose |
|---|---|---|---|
| **Dark masthead** | `#06070A` obsidian | Gold eyebrow + white Bebas heading (34px desktop / 30px ≤620px) | Brand identity first impression |
| **Light reading card** | `#FFFFFF` on `#EEEAE0` page bg, `#E5DFD0` 1px border, 14px radius | Lead `#2A2D33` 17px serif-friendly, body `#3A3D44` 15.5px DM Sans | Long-form readability + email-client dark-mode-inversion resilient |
| **Gold CTA button** (optional) | `#D4AF37` gradient | Obsidian text, uppercase, 13px DM Sans | Single primary action per email |
| **Light footnote** | `#FFFFFF` | `#5A5D64` 13px DM Sans | Closing signoff, disclaimers, unsubscribe |
| **Dark footer** | `#06070A` obsidian | Logo wordmark 120px, gold tagline mono, footer legal `#5A6470` | Brand bookend, legal, Privacy/Terms/Disclaimer/Contact links |

### Inline-style rules for ALL `bodyHtml` callers

Body content renders inside the LIGHT card. Inline styles MUST use:

- **Default body text**: no inline color — inherits `#3A3D44`
- **`<strong>` / emphasis**: `color:#06070A` (near-black). **NEVER `#FFFFFF`** — invisible on white.
- **`<h2>` section heads**: `font-family:'Bebas Neue','Impact','Arial Narrow',sans-serif; font-size:22px; line-height:1.1; letter-spacing:0.02em; color:#06070A; text-transform:uppercase; font-weight:400; margin:32px 0 12px;`
- **Mono eyebrow inside callouts**: `font-family:'DM Mono',ui-monospace,monospace; font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#806820` (dark-gold, readable on white)
- **Pull-quote / callout**: `border-left:3px solid #D4AF37; background:rgba(212,175,55,0.04-0.06); padding:20-24px;` — inner text stays in body color, no white-on-gold
- **Hyperlinks inside body**: handled by the shell's `.mk-body a` rule (renders as `#806820` dark-gold underline). No inline `style="color:..."` needed on links.
- **Tables in bodyHtml**: white background, `#E5DFD0` borders. Header row `color:#806820` (dark gold), faint gold wash background `rgba(212,175,55,0.04)`. Body cells `color:#3A3D44`.

### Heading size: editorial, not poster

`34px` Bebas at desktop, `30px` mobile. **NOT 48-52px.** Newsletters are read sustainably; loud poster scale fatigues the eye on long-form. Same heading scale applies to ALL emails — verify/reset/magic-link benefit from the same restraint.

### Email vs in-product UI

`notify.css` styles in this design system are for **in-product toasts + transactional shells rendered by the app UI**, not the actual sent emails. Sent emails are server-rendered via the shell described above; CSS in `notify.css` does not flow through Resend. If shell-level changes are needed, edit `maketzo-backend/auth-helpers.js` `renderEmailShell` — that's the source of truth for the email surface.

---

## Canonical Headline & CTAs

These are locked unless testing proves otherwise:

- **Hero headline:** YOU KNOW THE RULES. YOU BREAK THEM ANYWAY. MAKETZO STOPS THAT.
- **Subheadline:** Your Trading Accountability Partner—helping you stay focused, follow your rules, and execute your edge with confidence and control.
- **Primary CTA:** Start 7-Day Free Trial
- **Secondary CTA:** See How It Works

---

## Where things live

| Concern | File |
|---|---|
| All design tokens (colors, type, spacing, etc.) | [tokens.css](tokens.css) |
| Components (.mk-btn, .mk-pill, .mk-card, .mk-banner, etc.) | [components.css](components.css) |
| Strategic brand bible (voice, positioning, audience, archetypes) | [../docs/maketzo_master_brand_style_guide.md](../docs/maketzo_master_brand_style_guide.md) |
| Current live snapshot (read-only reference) | [../source-archive/current-live-snapshot-2026-05-12/](../source-archive/current-live-snapshot-2026-05-12/) |

---

## Conflicts noted between brand guide & implemented CSS

These are intentional — tokens.css is more recent and refines the brand guide:

| Topic | Brand guide (older) | tokens.css (authoritative) |
|---|---|---|
| Button radius | 14–18px | **4px** (sharp, terminal-energy) |
| Card radius | 16–24px | **10–20px** |
| Obsidian black | `#050505` | **`#06070A`** (canonical ramp) |
| Display font | Not specified | **Bebas Neue** (display tier) |
| State machine colors | Generic functional | **Semantic-only** — never decorative |

---

## Updating the design system (sync workflow)

The design system is generated by **Claude Design**, which outputs a flat zip. The folder structure above mirrors that zip on purpose so updates require no path translation.

**To sync a new version:**

1. Drop the new zip into `.tmp/` (e.g., `.tmp/Maketzo.zip`).
2. Extract it: `Expand-Archive -Path .tmp/Maketzo.zip -DestinationPath .tmp/Maketzo-extracted -Force`.
3. Overwrite design-system root with the new files (CSS, HTML, JSX, new assets).
4. Skip the zip's `screenshots/` and `uploads/` folders — dev/historical context only.
5. Run a breakage scan:
   - `git diff` (or compare against archive) to spot **renamed/removed components** — these break consumers in `public_html/` if not patched.
   - `git diff` on tokens — note any **removed `--mk-*` variables** that may still be referenced outside the design-system.
6. Patch `public_html/` and `docs/` for any renames/removals surfaced in step 5.
7. Refresh the file inventory above and the inventory in `~/.claude/.../memory/project-design-system.md`.
8. Archive the prior design-system snapshot to `source-archive/design-system-pre-YYYY-MM-DD/` before deleting `.tmp/`.

**Historical reference of renames:**
- 2026-05-13 — `mk-divider*` → `mk-rule-gold*` (component family rename; `--mk-divider-*` variables removed from tokens.css).
