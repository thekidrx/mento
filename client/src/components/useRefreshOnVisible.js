import { useEffect, useRef } from 'react';

// Calls `refresh` whenever the browser tab becomes visible again, which is
// how a phone reports "the user switched back to this app".
export function useRefreshOnVisible(refresh) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') latest.current();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}
