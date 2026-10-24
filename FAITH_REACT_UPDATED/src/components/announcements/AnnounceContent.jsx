import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sanitizeHtml } from '../../lib/security-utils.js';

// An announcement/evaluation body clamped to a few lines with a "See more" button (the .announce-content +
// .btn-see-more pair and evaluation-description.js's measuring). The button only shows when the text really
// overflows; paragraphs, lists and narrow screens use the same rendered-height test.
export default function AnnounceContent({ html, id, className = 'announce-content', ariaControls }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(null);   // null until measured (the markup starts truncated)

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const wasTruncated = el.classList.contains('truncated');
    el.classList.add('truncated');
    const over = el.scrollHeight > el.clientHeight + 1;
    if (!wasTruncated) el.classList.remove('truncated');
    setOverflows(over);
  };

  useLayoutEffect(measure, [html]);
  useEffect(() => {
    let frame;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener('resize', refresh);
    const el = ref.current;
    el?.addEventListener('load', refresh, true);
    let ro = null, prev;
    if (typeof ResizeObserver !== 'undefined' && el?.parentElement) {
      ro = new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        if (width !== prev) { prev = width; refresh(); }
      });
      ro.observe(el.parentElement);
    }
    if (document.fonts) document.fonts.ready.then(refresh);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', refresh); el?.removeEventListener('load', refresh, true); ro?.disconnect(); };
  }, []);

  const isExpanded = !!overflows && expanded;
  return (
    <>
      <div className={`${className}${overflows === null || (overflows && !expanded) ? ' truncated' : ''}`} id={id} ref={ref}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || '') }}></div>
      <button type="button" hidden={!overflows} aria-expanded={isExpanded ? 'true' : 'false'} className="btn-see-more" aria-controls={ariaControls}
        onClick={() => setExpanded(e => !e)}>{isExpanded ? 'See less' : 'See more'}</button>
    </>
  );
}
