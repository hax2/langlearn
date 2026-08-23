# Puente — Learn Spanish with the Morphing Sentence Method

Puente is a free, private, offline-capable web app for intermediate English speakers learning Spanish.
Sentences start in English and **fuse into Spanish word by word** — the learner supplies each missing
translation from memory, and the scaffold disappears as they improve.

No accounts. No servers. No tracking. Everything runs in the browser.

## Features

- **5 practice modes**
  - 🧬 **Fusion** — click English words to flip them into Spanish; sentences start at higher fusion as you master them
  - 👂 **Echo Dictation** — hear a sentence, type it, get a color-coded word-by-word diff (LCS-based)
  - 🧩 **Sentence Builder** — rebuild a heard sentence from shuffled word chips
  - ✏️ **Cloze Quiz** — produce one missing word from a fully-Spanish sentence
  - 🎤 **Speak Back** — pronunciation scoring via the browser's speech recognition (Chrome/Edge)
- **Spaced repetition** — Leitner boxes (1/3/7/14-day intervals), due-first scheduling, per-card fusion level
- **Selectable difficulty** — practise Beginner, Intermediate or Advanced sentences, or mix all levels
- **143-sentence bank with grammar notes** — 14 topics, levels 1–3, covering preterite/imperfect,
  object pronouns, subjunctive triggers, por/para, ser/estar, and more
- **XP, levels, streaks, dashboard** with per-card review status
- **Browser TTS** with voice picker and speed control — no audio files needed
- **PWA**: installable on phone/desktop, works fully offline via service worker
- Keyboard shortcuts: `Space` replay · `Enter` check/next · `F` flip remaining · `Esc` close dialogs

## Run locally

Any of these work:

```bash
# simplest — just open it
open index.html            # macOS
start index.html           # Windows

# or serve it (enables the service worker / install prompt)
npx serve .
python -m http.server 8000
```

> The site is fully functional from `file://`; the service worker and install prompt
> only activate over `https://` or `localhost`.

## Deploy

It's a fully static site — any static host works.

**GitHub Pages**
```bash
git init && git add -A && git commit -m "Puente v1.0"
git branch -M main
git remote add origin https://github.com/YOU/puente.git
git push -u origin main
```
Then: repo → Settings → Pages → Deploy from branch → `main` / root.

**Netlify** — drag the `puente` folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Done.

**Vercel** — `npx vercel` inside this folder.

**Cloudflare Pages** — create a project → upload the folder (or connect the repo).

### After deploying

1. Set the social preview to an absolute URL in `index.html` (`og:image`, `twitter:image`),
   e.g. `https://your-domain.tld/icons/og-image.png`.
2. Optionally add `<link rel="canonical" href="https://your-domain.tld/">`.

## Adding sentences

Edit `js/data.js`. Each row:

```js
["topic", difficulty(1-3), "grammar note title",
 "spanish chunk|english chunk",
 "spanish chunk|english chunk", ...]
```

Chunks become clickable flip-units, so keep them short (1–4 words). The full Spanish sentence
is what TTS reads and what dictation grades against, so chunks must concatenate into natural Spanish.
Restart the app after editing; progress for existing cards (matched by index) is preserved.

## Browser support

| Feature | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| All modes except Speak Back | ✅ | ✅ | ✅ |
| Speak Back (mic scoring) | ✅ | partial | partial |

TTS voices vary by OS/browser; pick your favorite under ⚙️ Settings.

## Privacy

All data (progress, settings) lives in `localStorage` on the user's device.
Speech synthesis and recognition use the browser's built-in engines; audio is never stored or transmitted by Puente.

## License

MIT — see [LICENSE](LICENSE).
