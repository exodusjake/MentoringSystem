// Stylesheets the vanilla shared UI scripts (modal-motion, empty-states, ui-dropdown) injected into a page
// when they ran. <Page> adds/removes them per route so a page only has the ones it originally loaded.

const EASE = 'cubic-bezier(.22,1,.36,1)';
const OUT_MS = 210;

export const MODAL_MOTION_CSS = [
  '@keyframes mmOverlayIn{from{opacity:0}to{opacity:1}}',
  '@keyframes mmOverlayOut{from{opacity:1}to{opacity:0}}',
  '@keyframes mmDialogIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:none}}',
  '@keyframes mmDialogOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.97)}}',
  '.modal-overlay,.info-modal-overlay,.lightbox-overlay{animation:mmOverlayIn .24s ease both;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
  '.modal-overlay>*,.info-modal-overlay>*,.lightbox-overlay>*{animation:mmDialogIn .36s ' + EASE + ' both}',
  '.modal-overlay.mm-closing,.lightbox-overlay.mm-closing{display:flex}',
  '.mm-closing{animation:mmOverlayOut ' + OUT_MS + 'ms ease both!important;pointer-events:none}',
  '.mm-closing>*{animation:mmDialogOut ' + OUT_MS + 'ms ease both!important}',
  // buttons that open these modals get a little tactile feedback
  '.card-actions>button,.card-actions>.btn-primary,.card-actions>.btn-outline{transition:transform .15s ' + EASE + ',box-shadow .2s ease,background-color .2s ease,border-color .2s ease}',
  '.card-actions>button:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(37,99,235,.14)}',
  '.card-actions>button:active{transform:translateY(0) scale(.97);box-shadow:none}',
  '@media (prefers-reduced-motion:reduce){.modal-overlay,.info-modal-overlay,.lightbox-overlay,.modal-overlay>*,.info-modal-overlay>*,.lightbox-overlay>*{animation:none!important}.card-actions>button{transition:none}}'
].join('');
export const MODAL_OUT_MS = OUT_MS;

export const EMPTY_STATES_CSS = [
  '.es-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;',
  'text-align:center;animation:es-in .35s ease both}',
  '.es-icon{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:6px;',
  'background:rgba(100,116,139,.10);color:#64748b;box-shadow:0 0 0 8px rgba(100,116,139,.05)}',
  '.es-wrap--alert .es-icon{background:rgba(220,38,38,.09);color:#dc2626;box-shadow:0 0 0 8px rgba(220,38,38,.05)}',
  '.es-title{font-size:15px;font-weight:600;color:#4b5563;line-height:1.4}',
  '.es-hint{font-size:13px;color:#9ca3af;line-height:1.5;max-width:340px}',
  '.es-body{font-size:13px;color:#9ca3af;line-height:1.5;max-width:340px}',
  '.es-body>*{max-width:100%}',
  '.es-wrap--compact .es-icon{width:40px;height:40px;box-shadow:none}',
  '.es-wrap--compact .es-icon svg{width:20px;height:20px}',
  '.es-wrap--compact .es-title{font-size:13px}',
  '@keyframes es-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
  '@media (prefers-reduced-motion:reduce){.es-wrap{animation:none}}'
].join('');

export const DROPDOWN_CSS = [
  '.dd-native{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden;clip:rect(0 0 0 0)}',
  '.dd-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer;',
  'min-width:0;box-sizing:border-box;font-family:inherit;line-height:1.35;outline:none;',
  'transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease}',
  '.dd-trigger .dd-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dd-trigger .dd-label.is-placeholder{color:#9ca3af}',
  '.dd-chev{width:14px;height:14px;flex-shrink:0;color:#6b7280;transition:transform .25s cubic-bezier(.22,1,.36,1),color .18s}',
  '.dd-trigger.open .dd-chev{transform:rotate(180deg);color:#2563eb}',
  '.dd-trigger:hover:not(:disabled) .dd-chev{color:#2563eb}',
  '.dd-trigger.dd-boxed:hover:not(:disabled){border-color:#93c5fd}',
  '.dd-trigger.dd-boxed.open,.dd-trigger.dd-boxed:focus-visible{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)}',
  '.dd-trigger.dd-bare:focus-visible{outline:2px solid #93c5fd;outline-offset:3px;border-radius:6px}',
  '.filter-btn-wrap:focus-within,.filter-btn-wrap:has(.dd-trigger.open){border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.10)}',
  '.dd-trigger:disabled{cursor:not-allowed;opacity:.6;background-color:#f3f4f6}',
  '.dd-trigger.dd-bare:disabled{background-color:transparent}',

  '.dd-menu{position:fixed;z-index:2147483200;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:6px;',
  'box-shadow:0 14px 36px rgba(15,23,42,.16),0 2px 6px rgba(15,23,42,.06);max-height:300px;overflow-y:auto;overscroll-behavior:contain;',
  'opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top center;pointer-events:none;',
  'transition:opacity .16s ease,transform .2s cubic-bezier(.22,1,.36,1);font-family:inherit}',
  '.dd-menu.up{transform-origin:bottom center;transform:translateY(6px) scale(.98)}',
  '.dd-menu.show{opacity:1;transform:none;pointer-events:auto}',
  '.dd-menu::-webkit-scrollbar{width:8px}.dd-menu::-webkit-scrollbar-thumb{background:#d6dde8;border-radius:8px}',
  '.dd-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:8px;',
  'font-size:14px;color:#374151;cursor:pointer;transition:background .12s,color .12s;user-select:none}',
  '.dd-opt .dd-opt-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dd-opt.hover{background:#eff6ff;color:#1d4ed8}',
  '.dd-opt.selected{color:#2563eb;font-weight:600}',
  '.dd-opt.selected.hover{background:#dbeafe}',
  '.dd-opt .dd-check{width:15px;height:15px;flex-shrink:0;color:#2563eb;opacity:0;transform:scale(.6);transition:opacity .15s,transform .2s}',
  '.dd-opt.selected .dd-check{opacity:1;transform:none}',
  '.dd-opt.disabled{color:#b6bcc7;cursor:not-allowed}',
  '.dd-group{padding:8px 12px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af}',
  '.dd-empty{padding:12px;font-size:13px;color:#9ca3af;text-align:center}',
  '@media (prefers-reduced-motion:reduce){.dd-menu,.dd-chev,.dd-opt .dd-check{transition:none}}'
].join('');

import { DATEPICKER_CSS, TIMEPICKER_CSS } from './pickerStyles.js';

// enhancer flag (from pageMeta) -> [style id, css]
export const ENHANCER_STYLES = {
  modalMotion: ['astra-modal-motion-css', MODAL_MOTION_CSS],
  emptyStates: ['astra-empty-states-css', EMPTY_STATES_CSS],
  select:      ['astra-dropdown-css', DROPDOWN_CSS],
  date:        ['astra-datepicker-css', DATEPICKER_CSS],
  time:        ['astra-timepicker-css', TIMEPICKER_CSS],
};
