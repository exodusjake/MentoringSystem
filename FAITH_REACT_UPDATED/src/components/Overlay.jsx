import { useEffect, useRef, useState } from 'react';
import { useEnhancer } from '../app/Page.jsx';
import { MODAL_OUT_MS } from '../app/enhancerStyles.js';

// A modal overlay. The vanilla pages kept every overlay in the DOM and toggled `.active` (or
// style.display); here it is mounted while open, with the same classes. On pages that loaded
// modal-motion.js, closing keeps the overlay painted for ~210ms with `.mm-closing` first, exactly
// like the vanilla exit animation.
//
//   <Overlay open={open} className="modal-overlay" activeClass="active" onClick={...}>…</Overlay>
//   activeClass: class added while open ('active' by default, null for overlays that are always flex)
//   display: inline display used while open (for overlays toggled with style.display)
export default function Overlay({ open, className = 'modal-overlay', activeClass = 'active', display = null, children, style, ...rest }) {
  const motion = useEnhancer('modalMotion');
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open && motion) {
      setClosing(true);
      const id = setTimeout(() => setClosing(false), MODAL_OUT_MS);
      wasOpen.current = open;
      return () => clearTimeout(id);
    }
    if (open) setClosing(false);
    wasOpen.current = open;
  }, [open]);

  if (!open && !closing) return null;
  const cls = [className, open && activeClass, !open && closing && 'mm-closing'].filter(Boolean).join(' ');
  const st = open && display ? { ...style, display } : style;
  return <div className={cls} style={st} {...rest}>{children}</div>;
}
