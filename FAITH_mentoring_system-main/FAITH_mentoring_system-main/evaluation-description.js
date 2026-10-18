// Measure rendered height so paragraphs, lists and narrow screens use the same limit.
function updateEvaluationDescriptions(list) {
  list.querySelectorAll('.announce-content').forEach(content => {
    const button = content.nextElementSibling;
    if (!button || !button.classList.contains('btn-see-more')) return;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    content.classList.add('truncated');
    const overflows = content.scrollHeight > content.clientHeight + 1;
    button.hidden = !overflows;
    content.classList.toggle('truncated', overflows && !expanded);
    button.setAttribute('aria-expanded', String(overflows && expanded));
    button.textContent = overflows && expanded ? 'See less' : 'See more';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('formsList') || document.getElementById('announcementsList');
  if (!list) return;
  let frame;
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => updateEvaluationDescriptions(list));
  };
  // Only watch card replacement, not the button text updated during measurement.
  new MutationObserver(refresh).observe(list, { childList: true });
  if (typeof ResizeObserver !== 'undefined') {
    let previousWidth;
    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== previousWidth) { previousWidth = width; refresh(); }
    }).observe(list);
  }
  window.addEventListener('resize', refresh);
  list.addEventListener('load', refresh, true);
  if (document.fonts) document.fonts.ready.then(refresh);
  refresh();
});
