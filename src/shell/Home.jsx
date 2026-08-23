import { useEffect, useMemo, useState } from 'react';
import { navigate, urlFor } from './router.js';

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function greeting(date) {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function dateLine(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const TOTAL_MODULES = 43;

function useLearnStats() {
  return useMemo(() => {
    const progress = readJSON('gemlang-progress');
    const modules = progress?.modules || {};
    let completed = 0;
    let sentences = 0;
    for (const mod of Object.values(modules)) {
      if (mod.completedAt) {
        completed += 1;
        sentences += mod.totalSentences || 0;
      } else {
        sentences += mod.currentIndex || 0;
      }
    }
    return { completed, sentences, started: Object.keys(modules).length > 0 };
  }, []);
}

function usePracticeStats() {
  const [stats] = useState(() => {
    const state = readJSON('puente_v1');
    if (!state) return { due: 0, xp: 0, streak: 0, started: false };
    const now = Date.now();
    const due = Object.values(state.srs || {}).filter((r) => r && r.due <= now && r.box >= 0).length;
    return { due, xp: state.xp || 0, streak: state.streak || 0, started: true };
  });
  return stats;
}

function useReadStats() {
  const [stats, setStats] = useState({ total: null, current: null });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [libRes, progress] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}read/library.json`).then((r) => (r.ok ? r.json() : null)),
          Promise.resolve(readJSON('spanish-reader-progress')),
        ]);
        if (cancelled || !Array.isArray(libRes)) return;
        let current = null;
        if (progress) {
          const entries = Object.entries(progress)
            .map(([id, v]) => ({ id, ...v }))
            .filter((v) => v.duration > 0 && v.time > 0 && v.time / v.duration < 0.97)
            .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
          const track = entries[0] && libRes.find((t) => t.id === entries[0].id);
          if (track && entries[0]) {
            current = {
              title: track.title,
              percent: Math.round((entries[0].time / entries[0].duration) * 100),
            };
          }
        }
        setStats({ total: libRes.length, current });
      } catch {
        /* library stats are optional */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

function StatCard({ to, eyebrow, title, children, cta, accent }) {
  return (
    <a
      className="today-card glass-panel"
      href={urlFor(to)}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      <span className={`today-eyebrow ${accent}`}>{eyebrow}</span>
      <h2 className="today-title">{title}</h2>
      <div className="today-body">{children}</div>
      <span className="today-cta">{cta} →</span>
    </a>
  );
}

export default function Home() {
  const learn = useLearnStats();
  const practice = usePracticeStats();
  const read = useReadStats();
  const now = new Date();

  return (
    <div className="home-page animate-fade-in">
      <section className="home-hero glass-panel">
        <p className="home-date">{dateLine(now)}</p>
        <h1 className="home-greeting">
          {greeting(now)}. <span>Listo para español?</span>
        </h1>
        <p className="home-sub">
          One place for your Spanish loop — a structured course, real stories with synced audio,
          and sentence practice that sticks.
        </p>
      </section>

      <div className="home-grid">
        <StatCard to="/learn" eyebrow="Learn" title="Course" accent="is-purple" cta={learn.started ? 'Continue' : 'Start learning'}>
          {learn.completed > 0 ? (
            <>
              <strong>{learn.completed}</strong>&nbsp;of {TOTAL_MODULES} chapters complete
              <div className="today-bar">
                <span style={{ width: `${Math.min(100, (learn.completed / TOTAL_MODULES) * 100)}%` }} />
              </div>
              <p className="today-note">{learn.sentences.toLocaleString()} sentences practiced</p>
            </>
          ) : (
            <p className="today-note">43 guided chapters from greetings to advanced grammar.</p>
          )}
        </StatCard>

        <StatCard to="/read" eyebrow="Read" title="Library" accent="is-blue" cta={read.current ? 'Resume' : 'Pick a story'}>
          {read.current ? (
            <>
              Continue&nbsp;<strong>“{read.current.title}”</strong>
              <div className="today-bar">
                <span style={{ width: `${read.current.percent}%` }} />
              </div>
              <p className="today-note">{read.current.percent}% through the audio</p>
            </>
          ) : (
            <p className="today-note">
              {read.total ? `${read.total} narrated classics` : 'Narrated Spanish classics'} with synced text and instant vocab help.
            </p>
          )}
        </StatCard>

        <StatCard to="/practice" eyebrow="Practice" title="Puente" accent="is-amber" cta={practice.started ? 'Train' : 'Try it'}>
          {practice.started ? (
            <>
              <strong>{practice.due}</strong>&nbsp;sentences due for review
              <p className="today-note">
                {practice.xp.toLocaleString()} XP · {practice.streak}-day streak
              </p>
            </>
          ) : (
            <p className="today-note">Sentences fuse from English into Spanish as you recall them.</p>
          )}
        </StatCard>
      </div>

      <footer className="home-footer">
        <p>The loop: learn a chapter → read a story → save words → practice them → review what’s due.</p>
      </footer>
    </div>
  );
}
