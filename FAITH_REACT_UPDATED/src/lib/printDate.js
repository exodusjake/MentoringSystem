// The date a form is printed (Philippine time), e.g. "Oct 27, 2026". Filled into the DATE line under the signature so
// nobody has to write it in by hand.
export function printDateLabel(now = new Date()) {
  return now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
}
