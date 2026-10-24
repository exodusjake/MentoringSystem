// password-strength.js — one password rule + strength meter, used wherever a password is created or changed.
// Rule: at least 8 characters, at least 1 uppercase letter, at least 1 number.
// Strength: Weak (a rule is missing) · Good (all rules met) · Strong (all rules + 12+ characters or a symbol).
export const MESSAGE = 'Password must have at least 8 characters, 1 uppercase letter and 1 number.';

export function rules(pw) {
  pw = pw || '';
  return { len: pw.length >= 8, upper: /[A-Z]/.test(pw), num: /\d/.test(pw) };
}

export function strength(pw) {
  pw = pw || '';
  if (!pw) return { level: 0, label: '' };
  const r = rules(pw);
  const allMet = r.len && r.upper && r.num;
  if (!allMet) return { level: 1, label: 'Weak' };
  const extra = pw.length >= 12 || /[^A-Za-z0-9]/.test(pw);
  return extra ? { level: 3, label: 'Strong' } : { level: 2, label: 'Good' };
}

// Returns an error message, or null when the password is acceptable.
export function validate(pw) {
  if (!pw) return 'Please enter a password.';
  if (pw.length > 100) return 'Password is too long (100 characters at most).';
  const r = rules(pw);
  return r.len && r.upper && r.num ? null : MESSAGE;
}

export const PasswordPolicy = { rules, strength, validate, MESSAGE };
