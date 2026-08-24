# LangLearn — Unified Spanish Learning Site

**Live:** https://samermakes.com/langlearn/ (also at https://hax2.github.io/langlearn/)
Repo: https://github.com/hax2/langlearn

One coherent site merged from three standalone language-learning projects:

| Section | Route | Source project | What it is |
|---|---|---|---|
| **Today** | `/` | new | Hub with your live progress across all three apps |
| **Learn** | `/learn` | `gemlang` | 43-chapter structured course (React + Supabase auth/billing) |
| **Read** | `/read` | `reader` | Narrated library of Spanish classics with synced audio |
| **Practice** | `/practice` | `bridge/puente` | Sentence-fusion trainer with spaced repetition (PWA) |

The architecture follows `../SUPER_LANGUAGE_APP_PLAN.md`: GemLang is the umbrella
product; Reader and Puente keep their focused experiences but live inside one
site, brand, and navigation.

## Structure

```
mega/
├── index.html              # unified shell entry
├── src/
│   ├── main.jsx            # mounts Shell, loads gemlang design tokens
│   ├── shell/              # nav bar, router, Today hub, iframe host
│   └── gemlang/            # full GemLang React app (mounted natively at /learn)
├── public/
│   ├── read/               # Reader static app + ~400MB media, copied verbatim
│   ├── practice/           # Puente PWA, copied verbatim
│   ├── audio/              # GemLang lesson narration
│   └── favicon.svg
├── supabase/               # GemLang edge functions + migrations
├── tools/
│   ├── gemlang/            # TTS generation, data validation, webhook scripts
│   └── reader/             # transcription/narration pipeline scripts
└── docs/                   # original READMEs & monetization docs per project
```

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Supabase client vars go in `.env` (see `.env.example`). Server-side secrets
(Google TTS, Gemini keys) stay in the original projects only — they are not
needed to run this site.

## Build & deploy

Deploys automatically: every push to `main` runs `.github/workflows/deploy.yml`,
which builds and publishes to GitHub Pages (site base path: `/langlearn/`).

```bash
npm run build      # outputs dist/ (~440MB incl. media)
npm run preview    # serve dist/ locally (mounts at /langlearn/)
npm run lint       # eslint (shell + gemlang source only)
```

Direct deep links (e.g. `/langlearn/learn`) rely on the GitHub Pages
`404.html` SPA-fallback in `public/`.

## How the merge works

- **Learn** is mounted natively: `src/gemlang/App.jsx` is imported into the
  shell unchanged (relative imports and its `import.meta.glob` module loader
  still resolve). GemLang's own header is restyled by the shell into a fused
  second chrome row ("Course · Settings · Upgrade").
- **Read** and **Practice** are complete documents served from `public/` and
  embedded same-origin via iframe below the shared nav — zero logic changes.
  Each gets a `theme.css` token-override bridge so both match the LangLearn
  purple-dark identity; Reader is also defaulted to its built-in `night`
  theme (first visit only, user choice still wins afterwards).
- Reader's first-run onboarding wizard was removed from this copy (markup +
  controller); the appearance settings menu remains for theme/font control.
- **Today** reads each app's localStorage (`gemlang-progress`, `puente_v1`,
  `spanish-reader-progress` + `/read/library.json`) to show real cross-app
  progress. Since all sections share one origin now, that data stays valid
  across sections.
- Puente's service worker and manifest use relative paths, so they scope
  correctly under `/practice/`.
- `tools/screenshot.mjs` (with `puppeteer-core`) captures all four sections
  for visual regression checks against a local preview.

## Originals

Nothing was deleted or modified in the source projects:
`~/Projects/gemlang`, `~/Projects/reader`, `~/Projects/bridge/puente-publish`.
