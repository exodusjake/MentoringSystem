/* ============================================================
   empty-states.js
   Shared by every portal. Upgrades the plain "No X yet" messages the
   pages already render (.empty-state, .table-empty, .eval-empty, ...)
   into a proper empty state: icon + title + hint. Works on content
   rendered at any time via a MutationObserver, so page scripts need no
   changes.
   ============================================================ */
(function () {
  'use strict';

  var SELECTOR = [
    '.empty-state', '.empty-cell', '.table-empty', '.eval-empty', '.ann-empty',
    '.log-empty', '.mentees-empty', '.mentee-card-empty', '.top3-empty',
    '.hist-empty', '.cal-empty'
  ].join(',');
  var COMPACT = /(^|\s)(top3-empty|mentee-card-empty|hist-empty)(\s|$)/;

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var ICONS = {
    inbox: svg('<path d="M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-4.5a2.5 2.5 0 0 1-5 0H4z"/>'),
    megaphone: svg('<path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5"/><path d="M12 8h4l4-3v14l-4-3h-4a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z"/>'),
    calendar: svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/><path d="M9 16l2 2 4-4"/>'),
    users: svg('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9"/>'),
    clipboard: svg('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 12h6M9 16h4"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>'),
    pen: svg('<path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    photo: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 16l4-4 4 4 3-3 5 5"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>')
  };

  function pick(text) {
    var t = text.toLowerCase();
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

  var style = document.createElement('style');
  style.textContent = [
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
  document.head.appendChild(style);

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function decorate(el) {
    if (el.dataset.es) return;
    el.dataset.es = '1';
    // Already has its own icon/illustration, or isn't an empty message at all.
    if (el.querySelector('svg,img,i[class*="ti-"],.es-wrap')) return;
    var text = (el.textContent || '').trim();
    if (!text || text.length > 400) return;

    var cls = pick(text);
    var wrapCls = 'es-wrap' + (COMPACT.test(el.className) ? ' es-wrap--compact' : '') + (cls === 'alert' ? ' es-wrap--alert' : '');
    var plain = !el.children.length;
    var html;
    if (plain) {
      // "No sessions yet. Click + to add one." → title + hint
      var m = text.match(/^(.+?[.!?])\s+(\S.*)$/);
      var title = m ? m[1].replace(/\.$/, '') : text.replace(/\.$/, '');
      var hint = m ? m[2] : '';
      html = '<div class="es-title">' + esc(title) + '</div>' + (hint ? '<div class="es-hint">' + esc(hint) + '</div>' : '');
    } else {
      html = '<div class="es-body">' + el.innerHTML + '</div>';
    }
    el.innerHTML = '<div class="' + wrapCls + '"><span class="es-icon">' + ICONS[cls] + '</span>' + html + '</div>';
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(SELECTOR)) decorate(root);
    var list = root.querySelectorAll(SELECTOR);
    for (var i = 0; i < list.length; i++) decorate(list[i]);
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
