import { useEffect, useState } from 'react';

/**
 * Base-path-aware client router for GitHub Pages hosting
 * (site lives under e.g. /langlearn/).
 */
const BASE = import.meta.env.BASE_URL || '/';

/** Convert a route key ('/', '/learn') to a full pathname under BASE. */
export function urlFor(routeKey) {
  const root = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE; // '/langlearn'
  return routeKey === '/' ? `${root}/` : `${root}${routeKey}`;
}

/** Strip the BASE prefix from a pathname, returning the route key. */
export function routeKeyFromPath(pathname) {
  let rest = pathname;
  if (BASE !== '/' && rest.startsWith(BASE)) {
    rest = rest.slice(BASE.length);
  } else if (rest.startsWith('/') && BASE !== '/') {
    const root = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
    if (rest === root || rest.startsWith(`${root}/`)) {
      rest = rest.slice(root.length);
    }
  }
  return rest.startsWith('/') ? rest : `/${rest}`;
}

function consumeRedirectParam() {
  // Classic GitHub Pages SPA fallback: 404.html redirects to /?p=<real path>
  try {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('p');
    if (!target) return false;
    params.delete('p');
    const extra = params.toString();
    const search = extra ? `?${extra}` : '';
    window.history.replaceState({}, '', `${urlFor(target)}${search}`);
    return true;
  } catch {
    return false;
  }
}

export function navigate(routeKey) {
  const current = routeKeyFromPath(window.location.pathname);
  if (current === routeKey) return;
  window.history.pushState({}, '', urlFor(routeKey));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath() {
  const [routeKey, setRouteKey] = useState(() => {
    consumeRedirectParam();
    return routeKeyFromPath(window.location.pathname);
  });
  useEffect(() => {
    const onPop = () => setRouteKey(routeKeyFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return routeKey;
}
