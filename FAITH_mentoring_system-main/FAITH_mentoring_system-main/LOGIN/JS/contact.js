// Contact-us panel on the login page: slides the blue panel across to reveal
// the form, and posts it to /api/Contact (emailed to the Guidance Office).
(function () {
  const wrapper = document.querySelector('.wrapper');
  const loginPanel = document.querySelector('.right-side:not(.contact-side)');
  const contactPanel = document.getElementById('contactPanel');
  const slideBtn = document.getElementById('slideBtn');
  const slideLabel = document.getElementById('slideBtnLabel');
  if (!wrapper || !contactPanel || !slideBtn) return;

  function setOpen(open) {
    wrapper.classList.toggle('show-contact', open);
    contactPanel.toggleAttribute('inert', !open);
    loginPanel.toggleAttribute('inert', open);
    contactPanel.setAttribute('aria-hidden', String(!open));
    slideBtn.setAttribute('aria-expanded', String(open));
    slideLabel.textContent = open ? 'Back to log in' : 'Contact us';
    if (open) setTimeout(() => document.getElementById('cName').focus({ preventScroll: true }), 450);
  }
  const isOpen = () => wrapper.classList.contains('show-contact');

  slideBtn.addEventListener('click', () => setOpen(!isOpen()));
  document.querySelectorAll('[data-contact-toggle]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); setOpen(!isOpen()); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) setOpen(false); });

  // ── Form ─────────────────────────────────────────────
  const form = document.getElementById('contactForm');
  const banner = document.getElementById('contactBanner');
  const btn = document.getElementById('contactBtn');
  const msg = document.getElementById('cMessage');
  const count = document.getElementById('cCount');

  msg.addEventListener('input', () => { count.textContent = msg.value.length + ' / 2000'; });

  function show(text, ok) {
    banner.textContent = text;
    banner.classList.toggle('success', !!ok);
    banner.style.display = 'block';
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    banner.style.display = 'none';

    const name = document.getElementById('cName').value.trim();
    const email = document.getElementById('cEmail').value.trim();
    const topic = document.getElementById('cTopic').value;
    const message = msg.value.trim();

    if (name.length < 2) return show('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show('Please enter a valid email address.');
    if (message.length < 10) return show('Please write a little more (at least 10 characters).');

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(CONFIG.getUrl('Contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message, website: document.getElementById('cWebsite').value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return show(data.message || 'Something went wrong. Please try again.');
      show(data.message || 'Your message has been sent.', true);
      form.reset();
      count.textContent = '0 / 2000';
    } catch (err) {
      show('Could not reach the server. Please check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
})();
