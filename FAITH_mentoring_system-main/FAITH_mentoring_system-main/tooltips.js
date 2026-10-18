/* Shared positioning for help tooltips across the portals. */
(function initializeTooltips() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', initializeTooltips, { once: true });
    return;
  }
  const selector = '.att-tip-box,.dash-tip-box,.hero-tip-box,.info-tip-box,.sd-tip-box,.generate-tooltip,.log-remarks-tooltip,.status-tooltip';
  const sources = new WeakMap();
  let active = null;
  let dismissed = null;
  let timer;
  let sequence = 0;

  function close() {
    clearTimeout(timer);
    if (!active) return;
    const { trigger, popup, previousDescription } = active;
    if (previousDescription === null) trigger.removeAttribute('aria-describedby');
    else trigger.setAttribute('aria-describedby', previousDescription);
    popup.remove();
    active = null;
  }

  function position() {
    if (!active) return;
    const { trigger, popup } = active;
    if (!trigger.isConnected) return close();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const margin = 12;
    const anchor = trigger.getBoundingClientRect();
    popup.style.width = Math.min(320, width - margin * 2) + 'px';
    popup.style.maxHeight = Math.max(48, height - margin * 2) + 'px';
    const box = popup.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(anchor.right - box.width, left + width - margin - box.width));
    const below = anchor.bottom + 8;
    const preferred = below + box.height <= top + height - margin ? below : anchor.top - box.height - 8;
    const y = Math.max(top + margin, Math.min(preferred, top + height - margin - box.height));
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }

  function open(trigger, explicit = false) {
    clearTimeout(timer);
    if (dismissed === trigger && !explicit) return;
    if (explicit) dismissed = null;
    if (active?.trigger === trigger) return position();
    const source = sources.get(trigger);
    if (!source || !source.textContent.trim()) return;
    close();
    const popup = source.cloneNode(true);
    popup.removeAttribute('data-tooltip-source');
    popup.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    popup.id = 'viewport-tooltip-' + ++sequence;
    popup.classList.add('viewport-tooltip');
    popup.setAttribute('role', 'tooltip');
    popup.setAttribute('popover', 'manual');
    popup.tabIndex = 0;
    const previousDescription = trigger.getAttribute('aria-describedby');
    trigger.setAttribute('aria-describedby', [previousDescription, popup.id].filter(Boolean).join(' '));
    document.body.appendChild(popup);
    if (popup.showPopover) popup.showPopover();
    active = { trigger, popup, previousDescription };
    popup.addEventListener('pointerenter', () => clearTimeout(timer));
    popup.addEventListener('pointerleave', dismissLater);
    popup.addEventListener('focusin', () => clearTimeout(timer));
    popup.addEventListener('focusout', dismissLater);
    position();
  }

  function dismissLater() { timer = setTimeout(close, 180); }

  function register() {
    document.querySelectorAll(selector).forEach(source => {
      if (source.classList.contains('viewport-tooltip') || source.hasAttribute('data-tooltip-source')) return;
      const trigger = source.parentElement;
      sources.set(trigger, source);
      source.setAttribute('data-tooltip-source', '');
      if (!trigger.matches('button,a,input,[tabindex]')) {
        trigger.tabIndex = 0;
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-label', 'Show information');
      }
      trigger.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') open(trigger);
      });
      trigger.addEventListener('pointerleave', event => {
        if (dismissed === trigger) dismissed = null;
        if (event.pointerType !== 'touch') dismissLater();
      });
      trigger.addEventListener('focusin', () => open(trigger));
      trigger.addEventListener('focusout', dismissLater);
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        open(trigger, true);
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(trigger, true);
        }
      });
    });
  }

  document.addEventListener('pointerdown', event => {
    if (active && !active.trigger.contains(event.target) && !active.popup.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      dismissed = active?.trigger || null;
      close();
    }
  });
  document.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  register();
  new MutationObserver(register).observe(document.body, { childList: true, subtree: true });
})();
