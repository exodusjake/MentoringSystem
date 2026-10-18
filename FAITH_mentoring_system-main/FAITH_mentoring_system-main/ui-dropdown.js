/* ============================================================
   ui-dropdown.js
   Replaces native <select> popups with a themed dropdown (blue accents,
   rounded panel, check on the selected item, keyboard support).
   The real <select> stays in the DOM and remains the source of truth, so
   existing page code (.value, .selectedIndex, change events, options being
   rebuilt, disabled toggling, form validation) keeps working unchanged.
   Usage: include the script on a page; every <select> is enhanced.
   Opt a select out with data-native="1".
   ============================================================ */
(function () {
  'use strict';

  var CHEVRON = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  var css = [
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
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  var openDD = null; // currently open dropdown instance

  function Dropdown(select) {
    this.select = select;
    this.trigger = null;
    this.menu = null;
    this.items = [];
    this.active = -1;
    this.typed = '';
    this.typedTimer = null;
    this.build();
  }

  Dropdown.prototype.build = function () {
    var self = this, sel = this.select;
    var cs = getComputedStyle(sel);
    var bare = cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-trigger ' + (bare ? 'dd-bare' : 'dd-boxed') + ' ' + (sel.className || '');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (sel.id) btn.setAttribute('data-for', sel.id);
    var st = btn.style;
    st.fontSize = cs.fontSize; st.fontWeight = cs.fontWeight; st.color = cs.color;
    if (!bare) {
      st.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
      st.borderRadius = cs.borderTopLeftRadius;
      st.padding = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
      st.backgroundColor = cs.backgroundColor;
      st.width = '100%';
    } else {
      st.border = '0'; st.background = 'transparent'; st.padding = '0'; st.flex = '1'; st.width = '100%';
    }
    if (cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    // The select's own right-padding existed to make room for its arrow.
    btn.innerHTML = '<span class="dd-label"></span>' + CHEVRON;
    this.label = btn.querySelector('.dd-label');
    this.trigger = btn;

    sel.classList.add('dd-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(btn, sel.nextSibling);

    btn.addEventListener('click', function () { self.isOpen() ? self.close() : self.open(); });
    btn.addEventListener('keydown', function (e) { self.onKey(e); });
    sel.addEventListener('change', function () { self.refresh(); });
    // Labels / validation that focus the native select land on the trigger.
    sel.addEventListener('focus', function () { btn.focus(); });

    // Keep in sync when page code assigns value / selectedIndex directly.
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(this); },
      set: function (v) { valueDesc.set.call(this, v); self.refresh(); }
    });
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get: function () { return indexDesc.get.call(this); },
      set: function (v) { indexDesc.set.call(this, v); self.refresh(); }
    });
    // …and when options are rebuilt or the select is enabled/disabled.
    new MutationObserver(function () { self.refresh(); })
      .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'hidden', 'label'] });

    this.refresh();
  };

  Dropdown.prototype.refresh = function () {
    var sel = this.select;
    var opt = sel.options[sel.selectedIndex];
    var text = opt ? opt.textContent.trim() : '';
    this.label.textContent = text || ' ';
    this.label.classList.toggle('is-placeholder', !!opt && opt.value === '' && /^(select|choose|—|-|\.\.\.)/i.test(text));
    this.trigger.disabled = sel.disabled;
    if (this.isOpen()) this.renderItems();
  };

  Dropdown.prototype.isOpen = function () { return !!this.menu; };

  Dropdown.prototype.renderItems = function () {
    var self = this, sel = this.select;
    this.menu.innerHTML = '';
    this.items = [];
    var children = sel.children;
    var count = 0;
    function addOption(o) {
      if (o.hidden) return;
      var el = document.createElement('div');
      el.className = 'dd-opt' + (o.selected ? ' selected' : '') + (o.disabled ? ' disabled' : '');
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', o.selected ? 'true' : 'false');
      el.innerHTML = '<span class="dd-opt-text"></span>' + CHECK;
      el.firstChild.textContent = o.textContent.trim() || ' ';
      var item = { el: el, option: o };
      if (!o.disabled) {
        el.addEventListener('mouseenter', function () { self.setActive(self.items.indexOf(item)); });
        el.addEventListener('mousedown', function (e) { e.preventDefault(); });
        el.addEventListener('click', function () { self.choose(item); });
      }
      self.items.push(item);
      self.menu.appendChild(el);
      count++;
    }
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.tagName === 'OPTGROUP') {
        var g = document.createElement('div');
        g.className = 'dd-group';
        g.textContent = c.label;
        this.menu.appendChild(g);
        for (var j = 0; j < c.children.length; j++) addOption(c.children[j]);
      } else if (c.tagName === 'OPTION') addOption(c);
    }
    if (!count) {
      var e = document.createElement('div');
      e.className = 'dd-empty';
      e.textContent = 'No options';
      this.menu.appendChild(e);
    }
  };

  Dropdown.prototype.position = function () {
    var r = this.trigger.getBoundingClientRect();
    var m = this.menu, gap = 6;
    m.style.minWidth = Math.max(r.width, 160) + 'px';
    m.style.maxWidth = Math.min(window.innerWidth - 16, 420) + 'px';
    var mh = Math.min(m.scrollHeight, 300);
    var below = window.innerHeight - r.bottom - gap - 8;
    var above = r.top - gap - 8;
    var up = mh > below && above > below;
    m.classList.toggle('up', up);
    m.style.maxHeight = Math.max(120, Math.min(300, up ? above : below)) + 'px';
    var left = Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8);
    m.style.left = left + 'px';
    if (up) { m.style.top = 'auto'; m.style.bottom = (window.innerHeight - r.top + gap) + 'px'; }
    else { m.style.bottom = 'auto'; m.style.top = (r.bottom + gap) + 'px'; }
  };

  Dropdown.prototype.open = function () {
    if (this.select.disabled || this.isOpen()) return;
    if (openDD && openDD !== this) openDD.close();
    var self = this;
    this.menu = document.createElement('div');
    this.menu.className = 'dd-menu';
    this.menu.setAttribute('role', 'listbox');
    document.body.appendChild(this.menu);
    this.renderItems();
    this.position();
    this.trigger.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    var sel = this.items.findIndex(function (it) { return it.option.selected; });
    this.setActive(sel >= 0 ? sel : this.items.findIndex(function (it) { return !it.option.disabled; }), true);
    requestAnimationFrame(function () { if (self.menu) self.menu.classList.add('show'); });
    openDD = this;

    this._outside = function (e) {
      if (!self.menu.contains(e.target) && !self.trigger.contains(e.target)) self.close();
    };
    this._reflow = function (e) {
      if (e && e.type === 'scroll' && self.menu && self.menu.contains(e.target)) return;
      self.close();
    };
    document.addEventListener('mousedown', this._outside, true);
    window.addEventListener('resize', this._reflow);
    window.addEventListener('scroll', this._reflow, true);
  };

  Dropdown.prototype.close = function (focusBack) {
    if (!this.menu) return;
    var m = this.menu;
    this.menu = null;
    this.trigger.classList.remove('open');
    this.trigger.setAttribute('aria-expanded', 'false');
    m.classList.remove('show');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 180);
    document.removeEventListener('mousedown', this._outside, true);
    window.removeEventListener('resize', this._reflow);
    window.removeEventListener('scroll', this._reflow, true);
    if (openDD === this) openDD = null;
    if (focusBack) this.trigger.focus();
  };

  Dropdown.prototype.setActive = function (i, scroll) {
    if (i < 0 || i >= this.items.length) return;
    if (this.active >= 0 && this.items[this.active]) this.items[this.active].el.classList.remove('hover');
    this.active = i;
    var el = this.items[i].el;
    el.classList.add('hover');
    if (scroll !== false) el.scrollIntoView({ block: 'nearest' });
  };

  Dropdown.prototype.move = function (dir) {
    var n = this.items.length;
    if (!n) return;
    var i = this.active;
    for (var k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!this.items[i].option.disabled) { this.setActive(i); return; }
    }
  };

  Dropdown.prototype.choose = function (item) {
    var sel = this.select;
    if (item && !item.option.disabled) {
      var changed = sel.selectedIndex !== item.option.index;
      indexDesc.set.call(sel, item.option.index);
      this.refresh();
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    this.close(true);
  };

  Dropdown.prototype.onKey = function (e) {
    var open = this.isOpen();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!open) this.open(); else this.move(1); break;
      case 'ArrowUp': e.preventDefault(); if (!open) this.open(); else this.move(-1); break;
      case 'Home': if (open) { e.preventDefault(); this.setActive(0); } break;
      case 'End': if (open) { e.preventDefault(); this.setActive(this.items.length - 1); } break;
      case 'Enter':
      case ' ':
        if (open) { e.preventDefault(); this.choose(this.items[this.active]); }
        break;
      case 'Escape': if (open) { e.preventDefault(); e.stopPropagation(); this.close(true); } break;
      case 'Tab': if (open) this.close(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) this.typeAhead(e.key);
    }
  };

  Dropdown.prototype.typeAhead = function (ch) {
    var self = this;
    this.typed += ch.toLowerCase();
    clearTimeout(this.typedTimer);
    this.typedTimer = setTimeout(function () { self.typed = ''; }, 700);
    if (!this.isOpen()) this.open();
    var from = this.active >= 0 ? this.active : 0;
    for (var k = 0; k < this.items.length; k++) {
      var i = (from + (this.typed.length > 1 ? 0 : 1) + k) % this.items.length;
      var it = this.items[i];
      if (!it.option.disabled && it.option.textContent.trim().toLowerCase().indexOf(this.typed) === 0) { this.setActive(i); return; }
    }
  };

  function enhance(sel) {
    if (sel.dataset.dd || sel.dataset.native || sel.multiple || sel.size > 1) return;
    sel.dataset.dd = '1';
    new Dropdown(sel);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    var list = root.querySelectorAll ? root.querySelectorAll('select') : [];
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
