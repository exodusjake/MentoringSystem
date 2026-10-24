// One password rule (password-strength.js): at least 8 characters, 1 uppercase letter, 1 number.
// Strength: Weak (a rule is missing) · Good (all rules met) · Strong (all rules + 12+ characters or a symbol).
export const PASSWORD_MESSAGE = 'Password must have at least 8 characters, 1 uppercase letter and 1 number.';

export function passwordRules(pw) {
  pw = pw || '';
  return { len: pw.length >= 8, upper: /[A-Z]/.test(pw), num: /\d/.test(pw) };
}

export function passwordStrength(pw) {
  pw = pw || '';
  if (!pw) return { level: 0, label: '' };
  const r = passwordRules(pw);
  if (!(r.len && r.upper && r.num)) return { level: 1, label: 'Weak' };
  const extra = pw.length >= 12 || /[^A-Za-z0-9]/.test(pw);
  return extra ? { level: 3, label: 'Strong' } : { level: 2, label: 'Good' };
}

// An error message, or null when the password is acceptable.
export function validatePassword(pw) {
  if (!pw) return 'Please enter a password.';
  if (pw.length > 100) return 'Password is too long (100 characters at most).';
  const r = passwordRules(pw);
  return r.len && r.upper && r.num ? null : PASSWORD_MESSAGE;
}
