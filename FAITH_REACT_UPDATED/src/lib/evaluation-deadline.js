// Evaluation deadlines are stored as Philippine wall-clock time.
function evaluationDeadline(value) {
  if (!value) return null;
  let text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T23:59:59.999';
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(text)) text += '+08:00';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
function evaluationDeadlineLabel(value) {
  const date = evaluationDeadline(value);
  return date ? date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }) : '';
}
function evaluationDeadlineInput(value) {
  const date = evaluationDeadline(value);
  return date ? new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) : '';
}

export { evaluationDeadline, evaluationDeadlineLabel, evaluationDeadlineInput };
