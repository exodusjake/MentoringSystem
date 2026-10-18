/* ============================================================
   notify.js — shared toast + confirm dialog

   Replaces the browser's native alert()/confirm() with something that
   matches the rest of the UI instead of a jarring, unstyleable system
   dialog. Self-contained — creates its own DOM on first use, no markup
   or CSS changes needed in any page; just include this script and call
   showToast()/showConfirm().

   Several pages already keep a local showToast()/showErrorModal() wired
   to that page's own markup — this doesn't replace those. It exists for
   the plain alert()/confirm() calls that had nothing to reuse.
   ============================================================ */

(function () {
  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      #nf-toast-stack {
        position: fixed; top: 20px; right: 20px; z-index: 100000;
        display: flex; flex-direction: column; gap: 12px;
        pointer-events: none; align-items: flex-end;
      }
      .nf-toast {
        --nf-accent: #2563eb;
        font-family: 'DM Sans', system-ui, sans-serif;
        position: relative; overflow: hidden;
        display: flex; align-items: flex-start; gap: 12px;
        background: #fff; border: 1px solid #e3e8f0; border-radius: 14px;
        box-shadow: 0 14px 36px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06);
        padding: 20px 14px 14px 14px;
        width: 360px; max-width: calc(100vw - 24px); pointer-events: auto;
        opacity: 0; transform: translateX(28px) scale(.97);
        transition: opacity .28s ease, transform .38s cubic-bezier(.22,1,.36,1);
      }
      .nf-toast.nf-show { opacity: 1; transform: none; }
      .nf-toast.nf-hide { opacity: 0; transform: translateX(28px) scale(.97); transition-duration: .22s; }
      .nf-toast-success { --nf-accent: #16a34a; --nf-track: #bbf7d0; --nf-tint: #dcfce7; }
      .nf-toast-error   { --nf-accent: #dc2626; --nf-track: #fecaca; --nf-tint: #fee2e2; }
      .nf-toast-info    { --nf-accent: #2563eb; --nf-track: #bfdbfe; --nf-tint: #dbeafe; }
      .nf-toast-progress {
        position: absolute; left: 0; right: 0; top: 0; height: 5px; z-index: 2;
        background: var(--nf-track, #bfdbfe); pointer-events: none;
      }
      .nf-toast-progress .nf-toast-bar {
        display: block; height: 100%; width: 100%; transform-origin: left center;
        background: var(--nf-accent, #2563eb);
      }
      .nf-toast-icon {
        flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; margin-top: 1px;
        background: var(--nf-tint, #dbeafe); color: var(--nf-accent);
      }
      .nf-toast-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
      .nf-toast-body {
        flex: 1; font-size: 13.5px; color: #374151; line-height: 1.5;
        padding-top: 4px; word-break: break-word; min-width: 0;
      }
      .nf-toast-body strong { display: block; color: #111827; font-size: 14px; font-weight: 700; margin-bottom: 2px; }
      .nf-toast-close {
        flex-shrink: 0; background: none; border: none; cursor: pointer;
        color: #9ca3af; padding: 4px; line-height: 1; font-size: 18px; border-radius: 8px;
        transition: background .15s, color .15s;
      }
      .nf-toast-close:hover { color: #111827; background: #f3f4f6; }
      @media (prefers-reduced-motion: reduce) {
        .nf-toast, .nf-toast.nf-hide { transition: opacity .15s ease; transform: none; }
      }

      .nf-confirm-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        z-index: 100001; display: flex; align-items: center;
        justify-content: center; padding: 16px;
        opacity: 0; transition: opacity .15s ease;
      }
      .nf-confirm-overlay.nf-show { opacity: 1; }
      .nf-confirm-card {
        font-family: 'DM Sans', system-ui, sans-serif;
        background: #fff; border-radius: 16px; padding: 26px 24px 20px;
        width: 100%; max-width: 380px; text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        transform: scale(.96); transition: transform .15s ease;
      }
      .nf-confirm-overlay.nf-show .nf-confirm-card { transform: scale(1); }
      .nf-confirm-message {
        font-size: 14.5px; color: #111827; line-height: 1.55; margin: 0 0 20px;
        white-space: pre-line; text-align: left;
      }
      .nf-confirm-actions { display: flex; justify-content: center; gap: 10px; }
      .nf-confirm-btn {
        font-family: inherit; font-size: 13px; font-weight: 600;
        border-radius: 10px; padding: 9px 20px; cursor: pointer;
        border: 1px solid transparent; transition: background .15s;
      }
      .nf-confirm-cancel { background: #fff; border-color: #dce3ec; color: #374151; }
      .nf-confirm-cancel:hover { background: #f4f7fb; }
      .nf-confirm-ok { background: #dc2626; color: #fff; }
      .nf-confirm-ok:hover { background: #b91c1c; }
      /* Opt-in via options.variant = 'primary' — for a deliberate but
         non-destructive action (e.g. a settings change), where the default
         red reads as an alarming "delete" warning it isn't. */
      .nf-confirm-ok.nf-confirm-primary { background: #2563eb; }
      .nf-confirm-ok.nf-confirm-primary:hover { background: #1d4ed8; }

      @media (max-width: 480px) {
        #nf-toast-stack { left: 12px; right: 12px; top: 12px; align-items: stretch; }
        .nf-toast { width: auto; max-width: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function toastStack() {
    let stack = document.getElementById('nf-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'nf-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  const ICONS = {
    error:   '<svg viewBox="0 0 24 24"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    info:    '<svg viewBox="0 0 24 24"><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/></svg>'
  };

  // showToast(message, type?, durationMs?) — type is 'error' (default),
  // 'success', or 'info'. message is always set via textContent, never
  // innerHTML, so it's never a place to inject markup.
  // A progress bar along the top shows how long the toast has left; hovering
  // pauses both the bar and the timer.
  window.showToast = function (message, type = 'error', durationMs = 4500) {
    injectStyles();
    const stack = toastStack();

    const toast = document.createElement('div');
    toast.className = `nf-toast nf-toast-${ICONS[type] ? type : 'info'}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.style.setProperty('--nf-dur', durationMs + 'ms');
    toast.innerHTML = `
      <div class="nf-toast-progress"><span class="nf-toast-bar"></span></div>
      <span class="nf-toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="nf-toast-body"></span>
      <button class="nf-toast-close" aria-label="Dismiss">&times;</button>
    `;
    toast.querySelector('.nf-toast-body').textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('nf-show')));

    let gone = false;
    function dismiss() {
      if (gone) return;
      gone = true;
      toast.classList.remove('nf-show');
      toast.classList.add('nf-hide');
      setTimeout(() => toast.remove(), 240);
    }
    // The bar runs for the full duration; when it empties the toast leaves.
    // Hovering pauses it (so the timer pauses with it).
    const bar = toast.querySelector('.nf-toast-bar');
    let anim = null;
    if (bar.animate) {
      anim = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: durationMs, easing: 'linear', fill: 'forwards' });
      anim.onfinish = dismiss;
      toast.addEventListener('mouseenter', () => anim.pause());
      toast.addEventListener('mouseleave', () => { if (!gone) anim.play(); });
    } else {
      setTimeout(dismiss, durationMs);
    }
    toast.querySelector('.nf-toast-close').addEventListener('click', dismiss);
  };

  // showConfirm(message, options?) -> Promise<boolean>. Replaces
  // confirm() — callers need `await`, so only usable from an async
  // function (every current call site already is).
  window.showConfirm = function (message, options = {}) {
    injectStyles();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'nf-confirm-overlay';
      overlay.innerHTML = `
        <div class="nf-confirm-card">
          <p class="nf-confirm-message"></p>
          <div class="nf-confirm-actions">
            <button class="nf-confirm-btn nf-confirm-cancel"></button>
            <button class="nf-confirm-btn nf-confirm-ok"></button>
          </div>
        </div>`;
      overlay.querySelector('.nf-confirm-message').textContent = message;
      overlay.querySelector('.nf-confirm-cancel').textContent = options.cancelText || 'Cancel';
      const okBtn = overlay.querySelector('.nf-confirm-ok');
      okBtn.textContent = options.confirmText || 'Delete';
      if (options.variant === 'primary') okBtn.classList.add('nf-confirm-primary');
      document.body.appendChild(overlay);

      requestAnimationFrame(() => overlay.classList.add('nf-show'));

      function close(result) {
        overlay.classList.remove('nf-show');
        setTimeout(() => overlay.remove(), 150);
        resolve(result);
      }
      overlay.querySelector('.nf-confirm-cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.nf-confirm-ok').addEventListener('click', () => close(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
  };
})();
