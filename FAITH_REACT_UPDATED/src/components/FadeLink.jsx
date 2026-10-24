import { Link, useNavigate } from 'react-router-dom';

// A <Link> that fades the current page out before navigating, so moving between the public pages
// (landing <-> login) is one smooth crossfade with the next page's fade-in (see Page.jsx / index.html).
export default function FadeLink({ to, onClick, ...rest }) {
  const navigate = useNavigate();
  const go = e => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // plain Link navigation
    e.preventDefault();
    document.body.classList.add('page-leave');
    setTimeout(() => navigate(to), 220);
  };
  return <Link to={to} onClick={go} {...rest} />;
}
