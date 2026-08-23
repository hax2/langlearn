import { useCallback } from 'react';
import { usePath, navigate, urlFor } from './router.js';
import Home from './Home.jsx';
import SubAppFrame from './SubAppFrame.jsx';
import GemLangApp from '../gemlang/App.jsx';

const NAV_ITEMS = [
  { path: '/', label: 'Today', match: (p) => p === '/' },
  { path: '/learn', label: 'Learn', match: (p) => p.startsWith('/learn') },
  { path: '/read', label: 'Read', match: (p) => p.startsWith('/read') },
  { path: '/practice', label: 'Practice', match: (p) => p.startsWith('/practice') },
];

function NavLink({ item, active }) {
  const handleClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate(item.path);
    },
    [item.path],
  );
  return (
    <a
      href={urlFor(item.path)}
      className={`shell-nav-link ${active ? 'is-active' : ''}`}
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
    >
      {item.label}
    </a>
  );
}

export default function Shell() {
  const path = usePath();

  let content;
  if (path.startsWith('/learn')) {
    content = (
      <div className="learn-embed">
        <GemLangApp />
      </div>
    );
  } else if (path.startsWith('/read')) {
    content = <SubAppFrame src={urlFor('/read/')} title="Read" description="Spanish listening library" />;
  } else if (path.startsWith('/practice')) {
    content = <SubAppFrame src={urlFor('/practice/')} title="Practice" description="Puente sentence fusion" />;
  } else {
    content = <Home />;
  }

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Primary">
        <a
          href={urlFor('/')}
          className="shell-brand"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="shell-brand-gem" aria-hidden="true">✦</span>
          LangLearn
        </a>
        <div className="shell-links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} item={item} active={item.match(path)} />
          ))}
        </div>
      </nav>
      <div className="shell-content">{content}</div>
    </div>
  );
}
