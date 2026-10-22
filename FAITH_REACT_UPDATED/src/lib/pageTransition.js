// Fade the portal's content area out, then run `go` (usually a navigate). The next page fades in by itself
// (see app/Page.jsx), so moving between pages inside a portal reads as one smooth transition.
export function leavePage(go, ms = 180) {
  const main = document.querySelector('.main-wrapper');
  if (!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  main.classList.add('main-leave');
  setTimeout(go, ms);
}
