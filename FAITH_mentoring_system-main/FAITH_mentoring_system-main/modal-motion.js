/* ============================================================
   modal-motion.js
   Smooth open AND close for modals, without touching the page's own
   open/close code. Opening is a CSS animation (fade backdrop + dialog
   rises and scales in). Closing is intercepted: when a page hides an
   overlay (style.display = 'none' or classList.remove('active')) the
   overlay is kept on screen for ~200ms to play the exit animation first.
   Works on .modal-overlay and .info-modal-overlay, including ones added
   later. Safe to include on any page.
   ============================================================ */
(function () {
  'use strict';

  var OUT_MS = 210;
  var EASE = 'cubic-bezier(.22,1,.36,1)';

  var css = [
    '@keyframes mmOverlayIn{from{opacity:0}to{opacity:1}}',
    '@keyframes mmOverlayOut{from{opacity:1}to{opacity:0}}',
    '@keyframes mmDialogIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:none}}',
    '@keyframes mmDialogOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.97)}}',
    '.modal-overlay,.info-modal-overlay{animation:mmOverlayIn .24s ease both;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '.modal-overlay>*,.info-modal-overlay>*{animation:mmDialogIn .36s ' + EASE + ' both}',
    '.modal-overlay.mm-closing{display:flex}',
    '.mm-closing{animation:mmOverlayOut ' + OUT_MS + 'ms ease both!important;pointer-events:none}',
    '.mm-closing>*{animation:mmDialogOut ' + OUT_MS + 'ms ease both!important}',
    // buttons that open these modals get a little tactile feedback
    '.card-actions>button,.card-actions>.btn-primary,.card-actions>.btn-outline{transition:transform .15s ' + EASE + ',box-shadow .2s ease,background-color .2s ease,border-color .2s ease}',
    '.card-actions>button:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(37,99,235,.14)}',
    '.card-actions>button:active{transform:translateY(0) scale(.97);box-shadow:none}',
    '@media (prefers-reduced-motion:reduce){.modal-overlay,.info-modal-overlay,.modal-overlay>*,.info-modal-overlay>*{animation:none!important}.card-actions>button{transition:none}}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isShown(el) { return getComputedStyle(el).display !== 'none'; }

  function hook(overlay) {
    if (overlay.__mm || reduce) return;
    overlay.__mm = true;
    var timer = null;

    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      overlay.classList.remove('mm-closing');
    }
    // Plays the exit animation, then runs the real hide.
    function closeThen(finish) {
      if (timer) return;
      overlay.classList.add('mm-closing');
      timer = setTimeout(function () {
        timer = null;
        overlay.classList.remove('mm-closing');
        finish();
      }, OUT_MS);
    }

    // 1) inline display: overlay.style.display = 'none' | 'flex' | ''
    var styleObj = overlay.style;
    var proto = Object.getPrototypeOf(styleObj);
    var desc = Object.getOwnPropertyDescriptor(proto, 'display');
    if (desc && desc.set) {
      Object.defineProperty(styleObj, 'display', {
        configurable: true,
        get: function () { return desc.get.call(this); },
        set: function (v) {
          if (v === 'none' && isShown(overlay) && !overlay.classList.contains('mm-closing')) {
            closeThen(function () { desc.set.call(styleObj, 'none'); });
          } else {
            if (v !== 'none') cancel();
            desc.set.call(styleObj, v);
          }
        }
      });
    }

    // 2) class based: classList.remove('active') / add('active')
    var cl = overlay.classList;
    var origRemove = cl.remove.bind(cl);
    var origAdd = cl.add.bind(cl);
    cl.remove = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.indexOf('active') !== -1 && cl.contains('active') && !cl.contains('mm-closing')) {
        origRemove.apply(null, args);       // class goes now; .mm-closing keeps it painted
        closeThen(function () {});
        return;
      }
      origRemove.apply(null, args);
    };
    cl.add = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.indexOf('active') !== -1) cancel();
      origAdd.apply(null, args);
    };
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    var sel = '.modal-overlay,.info-modal-overlay';
    if (root.matches && root.matches(sel)) hook(root);
    if (root.querySelectorAll) root.querySelectorAll(sel).forEach(hook);
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(scan); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
