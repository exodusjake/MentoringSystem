// mentor-section-progress.js — shared presentation only: counts come from the period-scoped monitoring API.
const read = (obj, camel, pascal) => obj?.[camel] ?? obj?.[pascal];
const count = value => Number.isInteger(value) && value >= 0;

export default function MentorSectionProgress({ mentor, compact = false }) {
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
    content = rows.map((row, i) => {
      const section = read(row, 'sectionCode', 'SectionCode');
      const done = read(row, 'completedSessions', 'CompletedSessions');
      const quota = read(row, 'requiredSessions', 'RequiredSessions');
      const historical = read(row, 'isCurrentlyHandled', 'IsCurrentlyHandled') === false;
      if (compact) {
        return (
          <span key={i} className="mentor-section-chip" aria-label={`${section}: ${done} of ${quota} sessions${historical ? ', previously handled' : ''}`}>
            <span>{section}{historical ? ' (previous)' : ''}</span><strong>{done}/{quota}</strong>
          </span>
        );
      }
      return (
        <div key={i} className="mentor-section-row"><span>{section}{historical ? <> <small>(previously handled)</small></> : null}</span><span className="mentor-section-count">{done}/{quota} sessions</span></div>
      );
    });
  } else {
    const sections = [...new Set(String(read(mentor, 'sections', 'Sections') || '')
      .split(',').map(s => s.trim()).filter(Boolean))];
    content = sections.map((section, i) => compact
      ? <span key={i} className="mentor-section-chip"><span>{section}</span></span>
      : <div key={i} className="mentor-section-row"><span>{section}</span></div>);
    if (!compact && count(total) && count(required)) {
      content.push(<div key="note" className="mentor-section-note">{total}/{required} sessions overall</div>);
    }
  }
  if (!content.length) return null;
  return compact
    ? <div className="mentor-section-progress mentor-section-progress--compact">{content}</div>
    : <div className="mentor-section-progress"><div className="mentor-section-heading">Sessions by section</div>{content}</div>;
}
