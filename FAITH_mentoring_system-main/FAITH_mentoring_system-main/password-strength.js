/* ============================================================
   password-strength.js — one password rule + live strength meter, used wherever a password is created or changed.
   Rule: at least 8 characters, at least 1 uppercase letter, at least 1 number.
   Strength: Weak (a rule is missing) · Good (all rules met) · Strong (all rules + 12+ characters or a symbol).
   Add data-pw-policy to a password <input> and the meter + checklist appear under it automatically.
   ============================================================ */
(function () {
  'use strict';
  if (window.PasswordPolicy) return;

  var MESSAGE = 'Password must have at least 8 characters, 1 uppercase letter and 1 number.';

  function rules(pw) {
    pw = pw || '';
    return { len: pw.length >= 8, upper: /[A-Z]/.test(pw), num: /\d/.test(pw) };
  }

  function strength(pw) {
    pw = pw || '';
    if (!pw) return { level: 0, label: '' };
    var r = rules(pw);
    var allMet = r.len && r.upper && r.num;
    if (!allMet) return { level: 1, label: 'Weak' };
    var extra = pw.length >= 12 || /[^A-Za-z0-9]/.test(pw);
    return extra ? { level: 3, label: 'Strong' } : { level: 2, label: 'Good' };
  }

  // Returns an error message, or null when the password is acceptable.
  function validate(pw) {
    if (!pw) return 'Please enter a password.';
    if (pw.length > 100) return 'Password is too long (100 characters at most).';
    var r = rules(pw);
    return r.len && r.upper && r.num ? null : MESSAGE;
  }

  function injectCss() {
    if (document.getElementById('pw-policy-css')) return;
    var st = document.createElement('style');
    st.id = 'pw-policy-css';
    st.textContent =
      '.pw-policy{margin-top:8px;text-align:left}' +
      '.pw-meter{display:flex;align-items:center;gap:10px}' +
      '.pw-meter-bar{display:flex;gap:4px;flex:1}' +
      '.pw-meter-bar i{flex:1;height:5px;border-radius:999px;background:#e5e7eb;transition:background .25s ease}' +
      '.pw-meter-label{min-width:48px;text-align:right;font-size:12px;font-weight:700;color:#9ca3af;transition:color .25s ease}' +
      '.pw-policy[data-level="1"] .pw-meter-bar i:nth-child(-n+1){background:#ef4444}' +
      '.pw-policy[data-level="1"] .pw-meter-label{color:#dc2626}' +
      '.pw-policy[data-level="2"] .pw-meter-bar i:nth-child(-n+2){background:#f59e0b}' +
      '.pw-policy[data-level="2"] .pw-meter-label{color:#d97706}' +
      '.pw-policy[data-level="3"] .pw-meter-bar i{background:#22c55e}' +
      '.pw-policy[data-level="3"] .pw-meter-label{color:#16a34a}' +
      '.pw-rules{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:3px}' +
      '.pw-rules li{position:relative;padding-left:20px;font-size:12px;line-height:1.4;color:#6b7280;transition:color .2s ease}' +
      '.pw-rules li::before{content:"";position:absolute;left:2px;top:3px;width:10px;height:10px;border-radius:50%;border:1.5px solid #cbd5e1;box-sizing:border-box;transition:all .2s ease}' +
      '.pw-rules li.ok{color:#15803d}' +
      '.pw-rules li.ok::before{background:#22c55e;border-color:#22c55e;box-shadow:inset 0 0 0 2px #fff}';
    document.head.appendChild(st);
  }

  function attach(input) {
    if (!input || input.dataset.pwAttached) return;
    input.dataset.pwAttached = '1';
    injectCss();

    var box = document.createElement('div');
    box.className = 'pw-policy';
    box.dataset.level = '0';
    box.innerHTML =
      '<div class="pw-meter"><div class="pw-meter-bar"><i></i><i></i><i></i></div><span class="pw-meter-label" aria-live="polite"></span></div>' +
      '<ul class="pw-rules">' +
        '<li data-r="len">At least 8 characters</li>' +
        '<li data-r="upper">At least 1 uppercase letter</li>' +
        '<li data-r="num">At least 1 number</li>' +
      '</ul>';

    var anchor = input.closest('.input-wrap, .pe-pw, .pw-input-wrap, .pwd-wrap') || input;
    anchor.parentNode.insertBefore(box, anchor.nextSibling);

    var label = box.querySelector('.pw-meter-label');
    function update() {
      var pw = input.value;
      var r = rules(pw), s = strength(pw);
      box.dataset.level = String(s.level);
      label.textContent = s.label;
      box.querySelectorAll('.pw-rules li').forEach(function (li) { li.classList.toggle('ok', !!r[li.dataset.r]); });
    }
    input.addEventListener('input', update);
    // programmatic resets (e.g. a form being cleared) don't fire "input"
    var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (proto && proto.set) {
      Object.defineProperty(input, 'value', {
        get: function () { return proto.get.call(this); },
        set: function (v) { proto.set.call(this, v); update(); },
        configurable: true
      });
    }
    update();
  }

  function scan() { document.querySelectorAll('input[data-pw-policy]').forEach(attach); }

  window.PasswordPolicy = { rules: rules, strength: strength, validate: validate, attach: attach, scan: scan, MESSAGE: MESSAGE };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
