import { useStyle } from '../lib/injectStyle.js';
import { passwordRules, passwordStrength } from '../lib/passwordPolicy.js';

// Live strength meter + rule checklist shown under a password field (password-strength.js).
// Render it right after the field's wrapper, where the original inserted it.
const CSS =
  '.pw-policy{margin-top:8px;text-align:left}' +
  '.pw-meter{display:flex;align-items:center;gap:10px}' +
  '.pw-meter-bar{display:flex;gap:4px;flex:1}' +
  '.pw-meter-bar i{flex:1;height:5px;border-radius:999px;background:#e5e7eb;transition:background .25s ease}' +
  '.pw-meter-label{min-width:48px;text-align:right;font-size:12px;font-weight:700;color:#9ca3af;transition:color .25s ease}' +
  '.pw-policy[data-level="1"] .pw-meter-bar i:nth-child(-n+1){background:#ef4444}' +
  '.pw-policy[data-level="1"] .pw-meter-label{color:#dc2626}' +
  '.pw-policy[data-level="2"] .pw-meter-bar i:nth-child(-n+2){background:#f59e0b}' +
  '.pw-policy[data-level="2"] .pw-meter-label{color:#d97706}' +
  '.pw-policy[data-level="3"] .pw-meter-bar i{background:#22c55e}' +
  '.pw-policy[data-level="3"] .pw-meter-label{color:#16a34a}' +
  '.pw-rules{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:3px}' +
  '.pw-rules li{position:relative;padding-left:20px;font-size:12px;line-height:1.4;color:#6b7280;transition:color .2s ease}' +
  '.pw-rules li::before{content:"";position:absolute;left:2px;top:3px;width:10px;height:10px;border-radius:50%;border:1.5px solid #cbd5e1;box-sizing:border-box;transition:all .2s ease}' +
  '.pw-rules li.ok{color:#15803d}' +
  '.pw-rules li.ok::before{background:#22c55e;border-color:#22c55e;box-shadow:inset 0 0 0 2px #fff}';

export default function PasswordMeter({ value }) {
  useStyle('pw-policy', CSS);
  const r = passwordRules(value), s = passwordStrength(value);
  return (
    <div className="pw-policy" data-level={String(s.level)}>
      <div className="pw-meter"><div className="pw-meter-bar"><i></i><i></i><i></i></div><span className="pw-meter-label" aria-live="polite">{s.label}</span></div>
      <ul className="pw-rules">
        <li data-r="len" className={r.len ? 'ok' : ''}>At least 8 characters</li>
        <li data-r="upper" className={r.upper ? 'ok' : ''}>At least 1 uppercase letter</li>
        <li data-r="num" className={r.num ? 'ok' : ''}>At least 1 number</li>
      </ul>
    </div>
  );
}
