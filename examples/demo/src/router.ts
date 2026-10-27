import { useSyncExternalStore } from 'react';

/** History API ile en basit istemci yönlendirmesi. */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('popstate', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('popstate', fn);
  };
}

export function navigate(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, '', path);
  for (const fn of listeners) fn();
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}
