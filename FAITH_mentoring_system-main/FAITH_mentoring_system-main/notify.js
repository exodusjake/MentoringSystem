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
        display: flex; flex-direction: column; gap: 10px;
        pointer-events: none;
      }
      .nf-toast {
        font-family: 'DM Sans', system-ui, sans-serif;
        display: flex; align-items: flex-start; gap: 10px;
        background: #fff; border: 1px solid #dce3ec; border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.16); padding: 13px 14px;
        min-width: 260px; max-width: 380px; pointer-events: auto;
        opacity: 0; transform: translateX(16px);
        transition: opacity .18s ease, transform .18s ease;
      }
      .nf-toast.nf-show { opacity: 1; transform: translateX(0); }
      .nf-toast-icon {
        flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: #fff; margin-top: 1px;
      }
      .nf-toast-error   .nf-toast-icon { background: #dc2626; }
      .nf-toast-success .nf-toast-icon { background: #16a34a; }
      .nf-toast-info    .nf-toast-icon { background: #2563eb; }
      .nf-toast-body {
        flex: 1; font-size: 13.5px; color: #111827; line-height: 1.45;
        padding-top: 1px; word-break: break-word;
      }
      .nf-toast-close {
        flex-shrink: 0; background: none; border: none; cursor: pointer;
        color: #9ca3af; padding: 0; line-height: 1; font-size: 16px;
      }
      .nf-toast-close:hover { color: #374151; }

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
        #nf-toast-stack { left: 12px; right: 12px; top: 12px; }
        .nf-toast { max-width: none; }
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

  const ICONS = { error: '!', success: '✓', info: 'i' };

  // showToast(message, type?, durationMs?) — type is 'error' (default),
  // 'success', or 'info'. message is always set via textContent, never
  // innerHTML, so it's never a place to inject markup.
  window.showToast = function (message, type = 'error', durationMs = 4500) {
    injectStyles();
    const stack = toastStack();

    const toast = document.createElement('div');
    toast.className = `nf-toast nf-toast-${type}`;
    toast.innerHTML = `
      <span class="nf-toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="nf-toast-body"></span>
      <button class="nf-toast-close" aria-label="Dismiss">&times;</button>
    `;
    toast.querySelector('.nf-toast-body').textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('nf-show'));

    let timer;
    function dismiss() {
      clearTimeout(timer);
      toast.classList.remove('nf-show');
      setTimeout(() => toast.remove(), 180);
    }
    toast.querySelector('.nf-toast-close').addEventListener('click', dismiss);
    timer = setTimeout(dismiss, durationMs);
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
