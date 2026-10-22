import { forwardRef, useEffect, useRef, useState } from 'react';
import { useEnhancer } from '../app/Page.jsx';
import { useStyle } from '../lib/injectStyle.js';

// A modal backdrop (.modal-overlay, .info-modal-overlay, …). The original pages showed modals
// either with inline `display` (mode="display", shown as `display`, default 'flex') or by
// toggling a class (mode="class", default 'active'). On pages that loaded modal-motion.js,
// opening animates in (CSS) and closing keeps the overlay painted for the exit animation first.
const OUT_MS = 210;
const EASE = 'cubic-bezier(.22,1,.36,1)';
const MOTION_CSS = [
  '@keyframes mmOverlayIn{from{opacity:0}to{opacity:1}}',
  '@keyframes mmOverlayOut{from{opacity:1}to{opacity:0}}',
  '@keyframes mmDialogIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:none}}',
  '@keyframes mmDialogOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.97)}}',
  '.modal-overlay,.info-modal-overlay{animation:mmOverlayIn .24s ease both;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
  '.modal-overlay>*,.info-modal-overlay>*{animation:mmDialogIn .36s ' + EASE + ' both}',
  '.modal-overlay.mm-closing{display:flex}',
  '.mm-closing{animation:mmOverlayOut ' + OUT_MS + 'ms ease both!important;pointer-events:none}',
  '.mm-closing>*{animation:mmDialogOut ' + OUT_MS + 'ms ease both!important}',
  '.card-actions>button,.card-actions>.btn-primary,.card-actions>.btn-outline{transition:transform .15s ' + EASE + ',box-shadow .2s ease,background-color .2s ease,border-color .2s ease}',
  '.card-actions>button:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(37,99,235,.14)}',
  '.card-actions>button:active{transform:translateY(0) scale(.97);box-shadow:none}',
  '@media (prefers-reduced-motion:reduce){.modal-overlay,.info-modal-overlay,.modal-overlay>*,.info-modal-overlay>*{animation:none!important}.card-actions>button{transition:none}}',
].join('');

// Pages with modal-motion also had its .card-actions button feedback; mount once per such page.
export function useModalMotionStyles() {
  useStyle('modal-motion', MOTION_CSS, useEnhancer('modalMotion'));
}

const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Overlay = forwardRef(function Overlay(
  { open, mode = 'display', display = 'flex', openClass = 'active', className = '', style, children, ...rest }, ref) {
  const motion = useEnhancer('modalMotion');
  useModalMotionStyles();
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open && motion && !reduce()) {
      setClosing(true);
      const id = setTimeout(() => setClosing(false), OUT_MS);
      wasOpen.current = open;
      return () => clearTimeout(id);
    }
    if (open) setClosing(false);
    wasOpen.current = open;
  }, [open]);

  const visible = open || closing;
  const cls = className
    + (mode === 'class' && open ? ' ' + openClass : '')
    + (closing ? ' mm-closing' : '');
  const st = mode === 'display' ? { ...style, display: visible ? display : 'none' } : style;
  return <div ref={ref} className={cls} style={st} {...rest}>{children}</div>;
});
export default Overlay;
