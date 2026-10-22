import { useEffect } from 'react';
import { isLoggedIn } from './session.js';

// Vanilla portal pages did, on load:
//   history.pushState(null, '', location.href);
//   popstate -> logged out ? go to login : pushState again
// so the Back button never left the page for a signed-in user. Same here; the router's own history state is
// copied onto the extra entry so React Router stays consistent with it.
export function useBackGuard() {
  useEffect(() => {
    window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      if (!isLoggedIn()) window.location.href = '/login';
      else window.history.pushState(window.history.state, '', window.location.href);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
