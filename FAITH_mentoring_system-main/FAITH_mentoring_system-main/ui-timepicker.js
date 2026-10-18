/* ============================================================
   ui-timepicker.js
   Replaces the native <input type="time"> popup with a themed picker
   (hour / minute / AM-PM columns, Clear / Now), matching ui-dropdown.js and
   ui-datepicker.js. The real <input> stays in the DOM and remains the source
   of truth (value is always "HH:mm"), so existing page code (.value, input /
   change events, disabled toggling) keeps working unchanged.
   Usage: include the script on a page; every time input is enhanced.
   Opt an input out with data-native="1".
   ============================================================ */
(function () {
  'use strict';

  var CLOCK = '<svg class="tp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';

  var css = [
    '.tp-native{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden;clip:rect(0 0 0 0)}',
    '.tp-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer;min-width:0;box-sizing:border-box;font-family:inherit;line-height:1.35;outline:none;',
    'transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease}',
    '.tp-trigger .tp-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.tp-trigger .tp-label.is-placeholder{color:#9ca3af}',
    '.tp-icon{width:15px;height:15px;flex-shrink:0;color:#6b7280;transition:color .18s}',
    '.tp-trigger.open .tp-icon,.tp-trigger:hover:not(:disabled) .tp-icon{color:#2563eb}',
    '.tp-trigger:hover:not(:disabled){border-color:#93c5fd}',
    '.tp-trigger.open,.tp-trigger:focus-visible{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)}',
    '.tp-trigger:disabled{cursor:not-allowed;opacity:.6;background-color:#f3f4f6}',

    '.tp-menu{position:fixed;z-index:2147483200;width:236px;max-width:calc(100vw - 16px);box-sizing:border-box;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:10px;',
    'box-shadow:0 14px 36px rgba(15,23,42,.16),0 2px 6px rgba(15,23,42,.06);opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top center;pointer-events:none;',
    'transition:opacity .16s ease,transform .2s cubic-bezier(.22,1,.36,1);font-family:inherit;user-select:none}',
    '.tp-menu.up{transform-origin:bottom center;transform:translateY(6px) scale(.98)}',
    '.tp-menu.show{opacity:1;transform:none;pointer-events:auto}',
    '.tp-cols{display:grid;grid-template-columns:1fr 1fr 62px;gap:6px}',
    '.tp-col{display:flex;flex-direction:column;gap:2px;max-height:196px;overflow-y:auto;overscroll-behavior:contain;padding-right:2px}',
    '.tp-col::-webkit-scrollbar{width:6px}.tp-col::-webkit-scrollbar-thumb{background:#d6dde8;border-radius:6px}',
    '.tp-cell{flex-shrink:0;height:32px;border:0;border-radius:8px;background:transparent;font-family:inherit;font-size:14px;color:#374151;cursor:pointer;transition:background .12s,color .12s;padding:0}',
    '.tp-cell:hover{background:#eff6ff;color:#1d4ed8}',
    '.tp-cell.selected,.tp-cell.selected:hover{background:#2563eb;color:#fff;font-weight:600}',
    '.tp-cell:focus-visible{outline:2px solid #2563eb;outline-offset:1px}',
    '.tp-foot{display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #eef1f6}',
    '.tp-link{border:0;background:transparent;font-family:inherit;font-size:13px;font-weight:600;color:#2563eb;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .12s}',
    '.tp-link:hover{background:#eff6ff}',
    '@media (prefers-reduced-motion:reduce){.tp-menu{transition:none}}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var openTP = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function h12(h) { return h % 12 || 12; }
  function parse(v) {
    var m = /^(\d{1,2}):(\d{2})/.exec(v || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { h: +m[1], mi: +m[2] };
  }
  function fmt(t) { return h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM'); }

  function Picker(input) {
    this.input = input;
    this.menu = null;
    this.t = null; // working time while the menu is open
    this.build();
  }

  Picker.prototype.build = function () {
    var self = this, inp = this.input;
    var cs = getComputedStyle(inp);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tp-trigger ' + (inp.className || '');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    if (inp.id) btn.setAttribute('data-for', inp.id);
    var st = btn.style;
    st.fontSize = cs.fontSize; st.fontWeight = cs.fontWeight; st.color = cs.color;
    st.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
    st.borderRadius = cs.borderTopLeftRadius;
    st.padding = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
    st.backgroundColor = cs.backgroundColor;
    st.width = '100%';
    btn.innerHTML = '<span class="tp-label"></span>' + CLOCK;
    this.label = btn.querySelector('.tp-label');
    this.trigger = btn;
    this.placeholder = inp.getAttribute('placeholder') || 'Select time';

    inp.classList.add('tp-native');
    inp.tabIndex = -1;
    inp.setAttribute('aria-hidden', 'true');
    inp.parentNode.insertBefore(btn, inp.nextSibling);

    btn.addEventListener('click', function () { self.isOpen() ? self.close() : self.open(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!self.isOpen()) self.open(); }
      else if (e.key === 'Escape' && self.isOpen()) { e.preventDefault(); e.stopPropagation(); self.close(true); }
    });
    inp.addEventListener('focus', function () { btn.focus(); });
    inp.addEventListener('change', function () { self.refresh(); });
    Object.defineProperty(inp, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(this); },
      set: function (v) { valueDesc.set.call(this, v); self.refresh(); }
    });
    new MutationObserver(function () { self.refresh(); })
      .observe(inp, { attributes: true, attributeFilter: ['disabled', 'value'] });
    this.refresh();
  };

  Picker.prototype.isOpen = function () { return !!this.menu; };

  Picker.prototype.refresh = function () {
    var t = parse(this.input.value);
    this.label.textContent = t ? fmt(t) : this.placeholder;
    this.label.classList.toggle('is-placeholder', !t);
    this.trigger.disabled = this.input.disabled;
    if (this.isOpen()) this.render();
  };

  Picker.prototype.render = function () {
    var self = this, t = this.t;
    var cell = function (kind, val, text, sel) {
      return '<button type="button" class="tp-cell' + (sel ? ' selected' : '') + '" data-k="' + kind + '" data-v="' + val + '">' + text + '</button>';
    };
    var hours = '', mins = '';
    for (var h = 1; h <= 12; h++) hours += cell('h', h, pad(h), h === h12(t.h));
    for (var m = 0; m < 60; m += 1) mins += cell('mi', m, pad(m), m === t.mi);
    this.menu.innerHTML =
      '<div class="tp-cols"><div class="tp-col" data-col="h">' + hours + '</div><div class="tp-col" data-col="mi">' + mins + '</div>' +
      '<div class="tp-col">' + cell('ap', 'AM', 'AM', t.h < 12) + cell('ap', 'PM', 'PM', t.h >= 12) + '</div></div>' +
      '<div class="tp-foot"><button type="button" class="tp-link" data-act="clear">Clear</button>' +
      '<button type="button" class="tp-link" data-act="now">Now</button></div>';

    this.menu.querySelectorAll('.tp-cell').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
        if (k === 'h') self.t.h = (+v % 12) + (self.t.h >= 12 ? 12 : 0);
        else if (k === 'mi') self.t.mi = +v;
        else self.t.h = (self.t.h % 12) + (v === 'PM' ? 12 : 0);
        self.commit(false);
        self.render();
        self.scrollSelected();
        if (k === 'mi') self.close(true); // minute is the last thing picked
      });
    });
    this.menu.querySelector('[data-act="clear"]').addEventListener('click', function () { self.commit(true); self.close(true); });
    this.menu.querySelector('[data-act="now"]').addEventListener('click', function () {
      var n = new Date(); self.t = { h: n.getHours(), mi: n.getMinutes() };
      self.commit(false); self.close(true);
    });
  };

  Picker.prototype.scrollSelected = function () {
    this.menu.querySelectorAll('.tp-col[data-col]').forEach(function (col) {
      var s = col.querySelector('.selected');
      if (s) col.scrollTop = s.offsetTop - col.clientHeight / 2 + s.offsetHeight / 2;
    });
  };

  Picker.prototype.commit = function (clear) {
    var inp = this.input;
    var value = clear ? '' : pad(this.t.h) + ':' + pad(this.t.mi);
    var changed = valueDesc.get.call(inp) !== value;
    valueDesc.set.call(inp, value);
    this.refresh();
    if (changed) {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  Picker.prototype.position = function () {
    var r = this.trigger.getBoundingClientRect();
    var m = this.menu, gap = 6;
    var below = window.innerHeight - r.bottom - gap - 8;
    var above = r.top - gap - 8;
    var up = m.offsetHeight > below && above > below;
    m.classList.toggle('up', up);
    m.style.left = Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8) + 'px';
    if (up) { m.style.top = 'auto'; m.style.bottom = (window.innerHeight - r.top + gap) + 'px'; }
    else { m.style.bottom = 'auto'; m.style.top = (r.bottom + gap) + 'px'; }
  };

  Picker.prototype.open = function () {
    if (this.input.disabled || this.isOpen()) return;
    if (openTP && openTP !== this) openTP.close();
    var self = this;
    this.t = parse(this.input.value) || { h: 9, mi: 0 };
    this.menu = document.createElement('div');
    this.menu.className = 'tp-menu';
    this.menu.setAttribute('role', 'dialog');
    this.menu.setAttribute('aria-label', 'Choose time');
    document.body.appendChild(this.menu);
    this.render();
    this.scrollSelected();
    this.position();
    this.trigger.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { if (self.menu) self.menu.classList.add('show'); });
    openTP = this;

    this._outside = function (e) { if (!self.menu.contains(e.target) && !self.trigger.contains(e.target)) self.close(); };
    this._reflow = function (e) {
      if (e && e.type === 'scroll' && self.menu && self.menu.contains(e.target)) return;
      self.close();
    };
    this._key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); self.close(true); } };
    document.addEventListener('mousedown', this._outside, true);
    document.addEventListener('keydown', this._key, true);
    window.addEventListener('resize', this._reflow);
    window.addEventListener('scroll', this._reflow, true);
  };

  Picker.prototype.close = function (focusBack) {
    if (!this.menu) return;
    var m = this.menu;
    this.menu = null;
    this.trigger.classList.remove('open');
    this.trigger.setAttribute('aria-expanded', 'false');
    m.classList.remove('show');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 180);
    document.removeEventListener('mousedown', this._outside, true);
    document.removeEventListener('keydown', this._key, true);
    window.removeEventListener('resize', this._reflow);
    window.removeEventListener('scroll', this._reflow, true);
    if (openTP === this) openTP = null;
    if (focusBack) this.trigger.focus();
  };

  function enhance(inp) {
    if (inp.dataset.tp || inp.dataset.native || inp.type !== 'time') return;
    inp.dataset.tp = '1';
    new Picker(inp);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'INPUT') enhance(root);
    var list = root.querySelectorAll ? root.querySelectorAll('input[type="time"]') : [];
    for (var i = 0; i < list.length; i++) enhance(list[i]);
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
