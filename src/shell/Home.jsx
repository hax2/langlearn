import { useEffect, useMemo, useState } from 'react';
import { navigate, urlFor } from './router.js';
import modulesManifest from '../gemlang/data/modules-manifest.json';

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function dateLine(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** First unfinished chapter: prefer one already in progress, else the first not completed. */
function useNextChapter() {
  return useMemo(() => {
    const progress = readJSON('gemlang-progress');
    const modules = progress?.modules || {};
    let inProgress = null;
    let upNext = null;
    let completedCount = 0;
    for (const m of modulesManifest) {
      const mod = modules[m.id];
      if (mod?.completedAt) {
        completedCount += 1;
        continue;
      }
      if (!upNext) upNext = { manifest: m, mod };
      if (!inProgress && mod && (mod.currentIndex || 0) > 0) {
        inProgress = { manifest: m, mod };
      }
    }
    const pick = inProgress || upNext;
    if (!pick) return { completedCount, finished: true };
    const total = pick.manifest.sentenceCount || pick.mod.totalSentences || 0;
    const current = pick.mod ? Math.min(pick.mod.currentIndex || 0, total) : 0;
    return {
      finished: false,
      completedCount,
      label: pick.manifest.title,
      detail: inProgress ? 'in progress' : 'up next',
      percent: total ? Math.round((current / total) * 100) : 0,
      inProgress: Boolean(inProgress),
    };
  }, []);
}

function useCurrentStory() {
  const [story, setStory] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [lib, progress] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}read/library.json`).then((r) => (r.ok ? r.json() : null)),
          Promise.resolve(readJSON('spanish-reader-progress')),
        ]);
        if (cancelled || !Array.isArray(lib) || !progress) return;
        const entries = Object.entries(progress)
          .map(([id, v]) => ({ id, ...v }))
          .filter((v) => v.duration > 0 && v.time > 0 && v.time / v.duration < 0.97)
          .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
        const track = entries[0] && lib.find((t) => t.id === entries[0].id);
        if (cancelled || !track || !entries[0]) return;
        setStory({
          title: track.title,
          author: track.author,
          percent: Math.round((entries[0].time / entries[0].duration) * 100),
        });
      } catch {
        /* optional */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  return story;
}

function usePractice() {
  const [stats] = useState(() => {
    const s = readJSON('puente_v1');
    if (!s) return { due: 0, streak: 0, xp: 0, started: false };
    const now = Date.now();
    const due = Object.values(s.srs || {}).filter((r) => r && r.due <= now).length;
    return { due, streak: s.streak || 0, xp: s.xp || 0, started: true };
  });
  return stats;
}

function ContinueRow({ href, dot, section, children, meta }) {
  return (
    <a
      className="row"
      href={urlFor(href)}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      <span className={`row-dot ${dot}`} aria-hidden="true" />
      <span className="row-main">
        <span className="row-section">{section}</span>
        <span className="row-title">{children}</span>
      </span>
      <span className="row-meta">{meta}</span>
      <span className="row-arrow" aria-hidden="true">→</span>
    </a>
  );
}

export default function Home() {
  const chapter = useNextChapter();
  const story = useCurrentStory();
  const practice = usePractice();

  const hasAnyRow =
    !chapter.finished || Boolean(story) || (practice.started && practice.due > 0);

  return (
    <div className="home-page">
      <header className="home-head">
        <p className="home-date">{dateLine(new Date())}</p>
        <h1 className="home-heading">Continue</h1>
      </header>

      {!hasAnyRow && (
        <p className="home-empty">
          Nothing in progress yet. Pick something below when you’re ready.
        </p>
      )}

      <nav className="rows" aria-label="Continue where you left off">
        {!chapter.finished && (
          <ContinueRow href="/learn" dot="dot-purple" section={chapter.inProgress ? 'Course' : 'Up next'} meta={`${chapter.percent}%`}>
            {chapter.label}
          </ContinueRow>
        )}

        {story && (
          <ContinueRow href="/read" dot="dot-blue" section="Reading" meta={`${story.percent}%`}>
            {story.title}
            {story.author ? <span className="row-sub">{story.author}</span> : null}
          </ContinueRow>
        )}

        {practice.started && practice.due > 0 && (
          <ContinueRow href="/practice" dot="dot-green" section="Review" meta={`${practice.due} due`}>
            Sentence review
            {practice.streak > 0 ? <span className="row-sub">{practice.streak}-day streak · {practice.xp.toLocaleString()} XP</span> : null}
          </ContinueRow>
        )}
      </nav>

      <footer className="home-foot">
        {chapter.finished
          ? 'All chapters complete.'
          : `${chapter.completedCount}/${modulesManifest.length} chapters`}
        <span className="foot-sep">·</span>
        <a href={urlFor('/learn')} onClick={(e) => { e.preventDefault(); navigate('/learn'); }}>course</a>
        <span className="foot-sep">·</span>
        <a href={urlFor('/read')} onClick={(e) => { e.preventDefault(); navigate('/read'); }}>library</a>
        <span className="foot-sep">·</span>
        <a href={urlFor('/practice')} onClick={(e) => { e.preventDefault(); navigate('/practice'); }}>practice</a>
      </footer>
    </div>
  );
}
