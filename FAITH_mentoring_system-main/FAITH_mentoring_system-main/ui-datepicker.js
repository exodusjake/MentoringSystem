/* ============================================================
   ui-datepicker.js
   Replaces the native <input type="date"> / <input type="datetime-local"> popup with a themed calendar
   (blue accents, rounded panel, month navigation, Today / Clear), matching
   ui-dropdown.js. The real <input> stays in the DOM and remains the source
   of truth (value is always "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" for datetime-local), so existing page code (.value,
   input/change events, min/max, disabled toggling) keeps working unchanged.
   Usage: include the script on a page; every date input is enhanced.
   Opt an input out with data-native="1".
   ============================================================ */
(function () {
  'use strict';

  var CAL = '<svg class="dp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  var css = [
    '.dp-native{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden;clip:rect(0 0 0 0)}',
    '.dp-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer;',
    'min-width:0;box-sizing:border-box;font-family:inherit;line-height:1.35;outline:none;',
    'transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease}',
    '.dp-trigger .dp-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dp-trigger .dp-label.is-placeholder{color:#9ca3af}',
    '.dp-icon{width:15px;height:15px;flex-shrink:0;color:#6b7280;transition:color .18s}',
    '.dp-trigger.open .dp-icon,.dp-trigger:hover:not(:disabled) .dp-icon{color:#2563eb}',
    '.dp-trigger:hover:not(:disabled){border-color:#93c5fd}',
    '.dp-trigger.open,.dp-trigger:focus-visible{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)}',
    '.dp-trigger:disabled{cursor:not-allowed;opacity:.6;background-color:#f3f4f6}',

    '.dp-menu{position:fixed;z-index:2147483200;width:284px;max-width:calc(100vw - 16px);box-sizing:border-box;background:#fff;border:1px solid #dce3ec;border-radius:12px;padding:12px;',
    'box-shadow:0 14px 36px rgba(15,23,42,.16),0 2px 6px rgba(15,23,42,.06);',
    'opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top center;pointer-events:none;',
    'transition:opacity .16s ease,transform .2s cubic-bezier(.22,1,.36,1);font-family:inherit;user-select:none}',
    '.dp-menu.up{transform-origin:bottom center;transform:translateY(6px) scale(.98)}',
    '.dp-menu.show{opacity:1;transform:none;pointer-events:auto}',
    '.dp-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px}',
    '.dp-title{flex:1;text-align:center;font-size:14px;font-weight:700;color:#1f2937}',
    '.dp-nav{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#4b5563;cursor:pointer;transition:background .12s,color .12s}',
    '.dp-nav:hover{background:#eff6ff;color:#1d4ed8}',
    '.dp-nav svg{width:16px;height:16px}',
    '.dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}',
    '.dp-dow{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9ca3af;text-align:center;padding:4px 0}',
    '.dp-day{display:flex;align-items:center;justify-content:center;height:34px;border:0;border-radius:8px;background:transparent;font-size:13px;font-family:inherit;color:#374151;cursor:pointer;transition:background .12s,color .12s;padding:0}',
    '.dp-day:hover:not(:disabled){background:#eff6ff;color:#1d4ed8}',
    '.dp-day.out{color:#b6bcc7}',
    '.dp-day.today{box-shadow:inset 0 0 0 1.5px #93c5fd;font-weight:600}',
    '.dp-day.selected,.dp-day.selected:hover{background:#2563eb;color:#fff;font-weight:600}',
    '.dp-day:disabled{color:#d1d5db;cursor:not-allowed}',
    '.dp-day:focus-visible{outline:2px solid #2563eb;outline-offset:1px}',
    '.dp-foot{display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #eef1f6}',
    '.dp-link{border:0;background:transparent;font-family:inherit;font-size:13px;font-weight:600;color:#2563eb;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .12s}',
    '.dp-link:hover{background:#eff6ff}',
    '.dp-time{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #eef1f6}',
    '.dp-tin{width:42px;height:34px;box-sizing:border-box;text-align:center;font-family:inherit;font-size:14px;font-weight:600;color:#1f2937;border:1px solid #dce3ec;border-radius:8px;background:#fff;outline:none;padding:0;transition:border-color .15s,box-shadow .15s}',
    '.dp-tin:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}',
    '.dp-colon{font-weight:700;color:#6b7280}',
    '.dp-ampm{height:34px;padding:0 12px;border:1px solid #dce3ec;border-radius:8px;background:#fff;font-family:inherit;font-size:13px;font-weight:700;color:#2563eb;cursor:pointer;transition:background .12s,border-color .12s}',
    '.dp-ampm:hover{background:#eff6ff;border-color:#93c5fd}',
    '@media (prefers-reduced-motion:reduce){.dp-menu{transition:none}}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var valueAsDateDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'valueAsDate');
  var openDP = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var dt = new Date(y, mo, d);
    return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? { y: y, m: mo, d: d } : null;
  }
  function today() { var t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; }
  function parseTime(v) {
    var m = /T(\d{2}):(\d{2})/.exec(v || '');
    return m ? { h: +m[1], mi: +m[2] } : null;
  }
  function h12(h) { return h % 12 || 12; }
  function fmt(p, t) {
    var out = MONTHS[p.m].slice(0, 3) + ' ' + p.d + ', ' + p.y;
    if (t) out += ', ' + h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM');
    return out;
  }

  function Picker(input) {
    this.input = input;
    this.trigger = null;
    this.menu = null;
    this.view = null; // {y, m} month being shown
    this.dt = input.type === 'datetime-local';
    this.time = { h: 23, mi: 59 }; // time used when a day is picked (datetime-local)
    this.build();
  }

  Picker.prototype.build = function () {
    var self = this, inp = this.input;
    var cs = getComputedStyle(inp);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-trigger ' + (inp.className || '');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    if (inp.id) btn.setAttribute('data-for', inp.id);
    if (inp.title) btn.title = inp.title;
    var st = btn.style;
    st.fontSize = cs.fontSize; st.fontWeight = cs.fontWeight; st.color = cs.color;
    st.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
    st.borderRadius = cs.borderTopLeftRadius;
    st.padding = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
    st.backgroundColor = cs.backgroundColor;
    st.width = '100%';
    if (cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    btn.innerHTML = '<span class="dp-label"></span>' + CAL;
    this.label = btn.querySelector('.dp-label');
    this.trigger = btn;
    this.placeholder = inp.getAttribute('placeholder') || (this.dt ? 'Select date & time' : 'Select date');

    inp.classList.add('dp-native');
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

    // Keep in sync when page code assigns value directly (e.g. Clear filters).
    Object.defineProperty(inp, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(this); },
      set: function (v) { valueDesc.set.call(this, v); self.refresh(); }
    });
    if (valueAsDateDesc) {
      Object.defineProperty(inp, 'valueAsDate', {
        configurable: true,
        get: function () { return valueAsDateDesc.get.call(this); },
        set: function (v) { valueAsDateDesc.set.call(this, v); self.refresh(); }
      });
    }
    new MutationObserver(function () { self.refresh(); })
      .observe(inp, { attributes: true, attributeFilter: ['disabled', 'min', 'max', 'value'] });

    this.refresh();
  };

  Picker.prototype.isOpen = function () { return !!this.menu; };

  Picker.prototype.refresh = function () {
    var p = parse(this.input.value);
    this.label.textContent = p ? fmt(p, this.dt ? parseTime(this.input.value) : null) : this.placeholder;
    this.label.classList.toggle('is-placeholder', !p);
    this.trigger.disabled = this.input.disabled;
    if (this.isOpen()) this.render();
  };

  Picker.prototype.inRange = function (s) {
    var min = (this.input.min || '').slice(0, 10), max = (this.input.max || '').slice(0, 10);
    return !(min && s < min) && !(max && s > max);
  };

  Picker.prototype.render = function () {
    var self = this, v = this.view, sel = (this.input.value || '').slice(0, 10), t = today();
    var first = new Date(v.y, v.m, 1);
    var start = first.getDay();
    var html = '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month">' + PREV + '</button>' +
      '<div class="dp-title">' + MONTHS[v.m] + ' ' + v.y + '</div>' +
      '<button type="button" class="dp-nav" data-nav="1" aria-label="Next month">' + NEXT + '</button></div>' +
      '<div class="dp-grid">';
    DAYS.forEach(function (d) { html += '<div class="dp-dow">' + d + '</div>'; });
    for (var i = 0; i < 42; i++) {
      var dt = new Date(v.y, v.m, 1 - start + i);
      var s = iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
      var cls = 'dp-day' + (dt.getMonth() !== v.m ? ' out' : '') + (s === sel ? ' selected' : '') +
        (dt.getFullYear() === t.y && dt.getMonth() === t.m && dt.getDate() === t.d ? ' today' : '');
      html += '<button type="button" class="' + cls + '" data-date="' + s + '"' + (this.inRange(s) ? '' : ' disabled') + '>' + dt.getDate() + '</button>';
    }
    html += '</div>';
    if (this.dt) {
      var tm = this.time;
      html += '<div class="dp-time"><input class="dp-tin" data-t="h" inputmode="numeric" maxlength="2" aria-label="Hour" value="' + h12(tm.h) + '">' +
        '<span class="dp-colon">:</span>' +
        '<input class="dp-tin" data-t="mi" inputmode="numeric" maxlength="2" aria-label="Minute" value="' + pad(tm.mi) + '">' +
        '<button type="button" class="dp-ampm" data-act="ampm" aria-label="Toggle AM or PM">' + (tm.h >= 12 ? 'PM' : 'AM') + '</button></div>';
    }
    html += '<div class="dp-foot"><button type="button" class="dp-link" data-act="clear">Clear</button>' +
      '<button type="button" class="dp-link" data-act="today">Today</button>' +
      (this.dt ? '<button type="button" class="dp-link" data-act="done">Done</button>' : '') + '</div>';
    this.menu.innerHTML = html;
    this.menu.querySelectorAll('.dp-nav').forEach(function (b) {
      b.addEventListener('click', function () { self.shift(+b.getAttribute('data-nav')); });
    });
    this.menu.querySelectorAll('.dp-day').forEach(function (b) {
      b.addEventListener('click', function () { self.pick(b.getAttribute('data-date')); });
    });
    var done = this.menu.querySelector('[data-act="done"]');
    if (done) done.addEventListener('click', function () { self.close(true); });
    var ampm = this.menu.querySelector('[data-act="ampm"]');
    if (ampm) ampm.addEventListener('click', function () { self.time.h = (self.time.h + 12) % 24; self.timeChanged(); });
    this.menu.querySelectorAll('.dp-tin').forEach(function (inp) {
      inp.addEventListener('focus', function () { inp.select(); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); self.step(inp.getAttribute('data-t'), e.key === 'ArrowUp' ? 1 : -1); }
      });
      inp.addEventListener('change', function () { self.setTimePart(inp.getAttribute('data-t'), parseInt(inp.value, 10)); });
    });
    this.menu.querySelector('[data-act="clear"]').addEventListener('click', function () { self.choose(''); });
    this.menu.querySelector('[data-act="today"]').addEventListener('click', function () {
      var n = today(), s = iso(n.y, n.m, n.d);
      if (!self.inRange(s)) { self.view = { y: n.y, m: n.m }; self.render(); }
      else if (self.dt) { self.pick(s); self.view = { y: n.y, m: n.m }; self.render(); }
      else self.choose(s);
    });
  };

  // datetime-local: set the date (keeping the chosen time) without closing.
  Picker.prototype.pick = function (dateStr) {
    if (!this.dt) { this.choose(dateStr); return; }
    this.commit(dateStr + 'T' + pad(this.time.h) + ':' + pad(this.time.mi));
    this.render();
  };

  Picker.prototype.commit = function (value) {
    var inp = this.input;
    var changed = valueDesc.get.call(inp) !== value;
    valueDesc.set.call(inp, value);
    this.refresh();
    if (changed) {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  Picker.prototype.timeChanged = function () {
    var cur = this.input.value;
    if (parse(cur)) this.commit(cur.slice(0, 10) + 'T' + pad(this.time.h) + ':' + pad(this.time.mi));
    this.render();
  };

  Picker.prototype.setTimePart = function (part, n) {
    if (isNaN(n)) { this.render(); return; }
    if (part === 'h') {
      n = Math.min(12, Math.max(1, n));
      this.time.h = (n % 12) + (this.time.h >= 12 ? 12 : 0);
    } else {
      this.time.mi = Math.min(59, Math.max(0, n));
    }
    this.timeChanged();
  };

  Picker.prototype.step = function (part, dir) {
    if (part === 'h') this.setTimePart('h', ((h12(this.time.h) - 1 + dir + 12) % 12) + 1);
    else this.setTimePart('mi', (this.time.mi + dir + 60) % 60);
  };

  Picker.prototype.shift = function (d) {
    var m = this.view.m + d, y = this.view.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    this.view = { y: y, m: m };
    this.render();
    this.position();
  };

  Picker.prototype.position = function () {
    var r = this.trigger.getBoundingClientRect();
    var m = this.menu, gap = 6;
    var mh = m.offsetHeight;
    var below = window.innerHeight - r.bottom - gap - 8;
    var above = r.top - gap - 8;
    var up = mh > below && above > below;
    m.classList.toggle('up', up);
    var left = Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8);
    m.style.left = left + 'px';
    if (up) { m.style.top = 'auto'; m.style.bottom = (window.innerHeight - r.top + gap) + 'px'; }
    else { m.style.bottom = 'auto'; m.style.top = (r.bottom + gap) + 'px'; }
  };

  Picker.prototype.open = function () {
    if (this.input.disabled || this.isOpen()) return;
    if (openDP && openDP !== this) openDP.close();
    var self = this;
    var p = parse(this.input.value) || today();
    this.view = { y: p.y, m: p.m };
    if (this.dt) { var pt = parseTime(this.input.value); if (pt) this.time = pt; }
    this.menu = document.createElement('div');
    this.menu.className = 'dp-menu';
    this.menu.setAttribute('role', 'dialog');
    this.menu.setAttribute('aria-label', 'Choose date');
    document.body.appendChild(this.menu);
    this.render();
    this.position();
    this.trigger.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { if (self.menu) self.menu.classList.add('show'); });
    openDP = this;

    this._outside = function (e) {
      if (!self.menu.contains(e.target) && !self.trigger.contains(e.target)) self.close();
    };
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
    if (openDP === this) openDP = null;
    if (focusBack) this.trigger.focus();
  };

  Picker.prototype.choose = function (value) {
    var inp = this.input;
    var changed = valueDesc.get.call(inp) !== value;
    valueDesc.set.call(inp, value);
    this.refresh();
    if (changed) {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.close(true);
  };

  function enhance(inp) {
    if (inp.dataset.dp || inp.dataset.native || (inp.type !== 'date' && inp.type !== 'datetime-local')) return;
    inp.dataset.dp = '1';
    new Picker(inp);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'INPUT') enhance(root);
    var list = root.querySelectorAll ? root.querySelectorAll('input[type="date"],input[type="datetime-local"]') : [];
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
