import { useEnhancer } from '../app/Page.jsx';

// empty-states.js: upgrades the plain "No X yet" messages (.empty-state, .table-empty, .eval-empty, ...)
// into icon + title + hint. In vanilla a MutationObserver did this to whatever the page rendered;
// here pages render <Empty> where they rendered one of those elements, and it applies the same markup.
function svg(inner) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{inner}</svg>
  );
}
const ICONS = {
  inbox: () => svg(<><path d="M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-4.5a2.5 2.5 0 0 1-5 0H4z"/></>),
  megaphone: () => svg(<><path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5"/><path d="M12 8h4l4-3v14l-4-3h-4a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z"/></>),
  calendar: () => svg(<><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/><path d="M9 16l2 2 4-4"/></>),
  users: () => svg(<><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9"/></>),
  clipboard: () => svg(<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 12h6M9 16h4"/></>),
  chat: () => svg(<><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/></>),
  pen: () => svg(<><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></>),
  photo: () => svg(<><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 16l4-4 4 4 3-3 5 5"/></>),
  alert: () => svg(<><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></>),
};

function pick(text) {
  const t = text.toLowerCase();
  if (/failed|error|unable|could not|couldn't/.test(t)) return 'alert';
  if (/announce/.test(t)) return 'megaphone';
  if (/comment/.test(t)) return 'chat';
  if (/signature/.test(t)) return 'pen';
  if (/proof|photo/.test(t)) return 'photo';
  if (/mentor|mentee|user|assign|department|section|course|student/.test(t)) return 'users';
  if (/form|evaluation|rating|ranked|score|logsheet|attendance/.test(t)) return 'clipboard';
  if (/session|activit|event|calendar|schedul|availab/.test(t)) return 'calendar';
  return 'inbox';
}

const COMPACT = /(^|\s)(top3-empty|mentee-card-empty|hist-empty)(\s|$)/;

// `as` is the element the vanilla page rendered ('div' by default, e.g. 'td' / 'tr' for table rows).
// Children: a string for the plain case ("No sessions yet. Click + to add one." -> title + hint), or JSX for
// markup-bearing messages (wrapped in .es-body, like the vanilla `el.innerHTML`).
export default function Empty({ as: Tag = 'div', className = '', children, plainText, ...rest }) {
  const enabled = useEnhancer('emptyStates');
  const text = plainText ?? (typeof children === 'string' ? children : '');
  const plain = typeof children === 'string';
  const textForPick = (plainText ?? (plain ? children : '')).trim();
  if (!enabled || (plain && (!textForPick || textForPick.length > 400))) {
    return <Tag className={className} {...rest}>{children}</Tag>;
  }
  const cls = pick(textForPick || String(text));
  const wrapCls = 'es-wrap' + (COMPACT.test(className) ? ' es-wrap--compact' : '') + (cls === 'alert' ? ' es-wrap--alert' : '');
  let body;
  if (plain) {
    // "No sessions yet. Click + to add one." → title + hint
    const m = textForPick.match(/^(.+?[.!?])\s+(\S.*)$/);
    const title = m ? m[1].replace(/\.$/, '') : textForPick.replace(/\.$/, '');
    const hint = m ? m[2] : '';
    body = <><div className="es-title">{title}</div>{hint ? <div className="es-hint">{hint}</div> : null}</>;
  } else {
    body = <div className="es-body">{children}</div>;
  }
  return (
    <Tag className={className} data-es="1" {...rest}>
      <div className={wrapCls}><span className="es-icon">{ICONS[cls]()}</span>{body}</div>
    </Tag>
  );
}
