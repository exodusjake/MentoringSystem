import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';

// Six one-digit boxes: type to advance, Backspace to go back, arrows to move, paste a full code.
// When every box is filled, onComplete(code) fires. `shake` (a counter) replays the shake animation.
const OtpBoxes = forwardRef(function OtpBoxes({ id, digits, setDigits, onComplete, shake }, ref) {
  const inputs = useRef([]);
  const boxesRef = useRef(null);
  useImperativeHandle(ref, () => ({ focusFirst: () => inputs.current[0]?.focus() }));

  useLayoutEffect(() => {
    if (!shake) return;
    const boxes = boxesRef.current;
    boxes.classList.remove('shake');
    void boxes.offsetWidth;
    boxes.classList.add('shake');
  }, [shake]);

  const update = next => {
    setDigits(next);
    if (next.join('').length === next.length) onComplete(next.join(''));
  };

  function onInput(i, value) {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = v;
    if (v && i < digits.length - 1) inputs.current[i + 1].focus();
    update(next);
  }
  function onKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1].focus();
      const next = [...digits]; next[i - 1] = ''; setDigits(next);
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1].focus();
    if (e.key === 'ArrowRight' && i < digits.length - 1) inputs.current[i + 1].focus();
  }
  function onPaste(e) {
    const ds = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, digits.length);
    if (!ds) return;
    e.preventDefault();
    const next = [...digits];
    ds.split('').forEach((d, k) => { next[k] = d; });
    inputs.current[Math.min(ds.length, digits.length - 1)].focus();
    setDigits(next);
    if (ds.length === digits.length) onComplete(next.join(''));
  }

  return (
    <div className="otp-boxes" id={id} ref={boxesRef}>
      {digits.map((d, i) => (
        <input key={i} ref={el => { inputs.current[i] = el; }} type="text" inputMode="numeric" maxLength="1"
          autoComplete={i === 0 ? 'one-time-code' : undefined} aria-label={`Digit ${i + 1}`}
          className={d ? 'filled' : undefined} value={d}
          onChange={e => onInput(i, e.target.value)} onKeyDown={e => onKeyDown(i, e)} onPaste={onPaste} />
      ))}
    </div>
  );
});
export default OtpBoxes;
