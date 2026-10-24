import { useLayoutEffect, useRef, useState } from 'react';
import { useEnhancer } from '../app/Page.jsx';
import { useStyle } from '../lib/injectStyle.js';
import { EMPTY_STATE_CSS, EMPTY_STATE_ICON_PATHS } from './emptyStateAssets.js';

// An "empty" message (.empty-state, .table-empty, .eval-empty, …). On pages that loaded the
// original empty-states.js it gets the same upgrade: icon + title + hint, chosen by the same rules
// from the rendered text. `as` is the element type (default div); other props pass through.
const COMPACT = /(^|\s)(top3-empty|mentee-card-empty|hist-empty)(\s|$)/;

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

export default function Empty({ as: Tag = 'div', className = '', children, ...rest }) {
  const enabled = useEnhancer('emptyStates');
  useStyle('empty-states', EMPTY_STATE_CSS, enabled);
  const ref = useRef(null);
  const [deco, setDeco] = useState(null);   // decided from the rendered DOM, like the original

  useLayoutEffect(() => {
    if (!enabled || deco) return;
    const el = ref.current;
    // Already has its own icon/illustration, or isn't an empty message at all.
    if (el.querySelector('svg,img,i[class*="ti-"],.es-wrap')) { setDeco({ skip: true }); return; }
    const text = (el.textContent || '').trim();
    if (!text || text.length > 400) { setDeco({ skip: true }); return; }
    const icon = pick(text);
    const plain = !el.children.length;
    let title = '', hint = '';
    if (plain) {
      // "No sessions yet. Click + to add one." → title + hint
      const m = text.match(/^(.+?[.!?])\s+(\S.*)$/);
      title = m ? m[1].replace(/\.$/, '') : text.replace(/\.$/, '');
      hint = m ? m[2] : '';
    }
    setDeco({ icon, plain, title, hint });
  }, [enabled, deco]);

  // The original marks every element it has looked at, including ones it left alone.
  if (enabled && deco?.skip) return <Tag ref={ref} className={className} data-es="1" {...rest}>{children}</Tag>;
  if (!enabled || !deco) return <Tag ref={ref} className={className} {...rest}>{children}</Tag>;
  const wrapCls = 'es-wrap' + (COMPACT.test(className) ? ' es-wrap--compact' : '') + (deco.icon === 'alert' ? ' es-wrap--alert' : '');
  return (
    <Tag ref={ref} className={className} data-es="1" {...rest}>
      <div className={wrapCls}>
        <span className="es-icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: EMPTY_STATE_ICON_PATHS[deco.icon] }} />
        </span>
        {deco.plain
          ? <><div className="es-title">{deco.title}</div>{deco.hint && <div className="es-hint">{deco.hint}</div>}</>
          : <div className="es-body">{children}</div>}
      </div>
    </Tag>
  );
}
