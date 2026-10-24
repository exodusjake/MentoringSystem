import { useEffect } from 'react';
import { isLoggedIn } from '../../lib/session.js';

// Keep the user on this page when they press Back (and recheck the session), as the original
// mentor pages did with pushState + popstate.
export function useStayOnBack() {
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
