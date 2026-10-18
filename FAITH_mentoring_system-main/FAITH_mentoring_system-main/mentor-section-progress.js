/* Shared presentation only: counts come from the period-scoped monitoring API. */
const MentorSectionProgress = (() => {
  const read = (obj, camel, pascal) => obj?.[camel] ?? obj?.[pascal];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const count = value => Number.isInteger(value) && value >= 0;

  function render(mentor, { compact = false } = {}) {
    const rows = read(mentor, 'sectionProgress', 'SectionProgress');
    const total = read(mentor, 'completedSessions', 'CompletedSessions');
    const required = read(mentor, 'requiredSessions', 'RequiredSessions');
    const valid = Array.isArray(rows) && rows.length > 0 && rows.every(row =>
      read(row, 'sectionCode', 'SectionCode') &&
      count(read(row, 'completedSessions', 'CompletedSessions')) &&
      count(read(row, 'requiredSessions', 'RequiredSessions')));
    // Never invent a split or show a breakdown that disagrees with the existing total.
    const reconciles = valid && count(total) && rows.reduce((sum, row) =>
      sum + read(row, 'completedSessions', 'CompletedSessions'), 0) === total;
    let content;
    if (reconciles) {
      content = rows.map(row => {
        const section = escape(read(row, 'sectionCode', 'SectionCode'));
        const done = read(row, 'completedSessions', 'CompletedSessions');
        const quota = read(row, 'requiredSessions', 'RequiredSessions');
        const historical = read(row, 'isCurrentlyHandled', 'IsCurrentlyHandled') === false;
        if (compact) {
          return `<span class="mentor-section-chip" aria-label="${section}: ${done} of ${quota} sessions${historical ? ', previously handled' : ''}"><span>${section}${historical ? ' (previous)' : ''}</span><strong>${done}/${quota}</strong></span>`;
        }
        return `<div class="mentor-section-row"><span>${section}${historical ?
          ' <small>(previously handled)</small>' : ''}</span><span class="mentor-section-count">${done}/${quota} sessions</span></div>`;
      }).join('');
    } else {
      const sections = [...new Set(String(read(mentor, 'sections', 'Sections') || '')
        .split(',').map(s => s.trim()).filter(Boolean))];
      content = sections.map(section => compact
        ? `<span class="mentor-section-chip"><span>${escape(section)}</span></span>`
        : `<div class="mentor-section-row"><span>${escape(section)}</span></div>`).join('');
      if (!compact && count(total) && count(required)) {
        content += `<div class="mentor-section-note">${total}/${required} sessions overall</div>`;
      }
    }
    if (!content) return '';
    return compact
      ? `<div class="mentor-section-progress mentor-section-progress--compact">${content}</div>`
      : `<div class="mentor-section-progress"><div class="mentor-section-heading">Sessions by section</div>${content}</div>`;
  }
  return { render };
})();
