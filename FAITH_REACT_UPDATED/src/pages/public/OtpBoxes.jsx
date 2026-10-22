import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Six one-digit boxes: type to advance, Backspace to go back, paste a full code. `onComplete(code)` fires when
// all six are filled. Imperative handle: value(), clear() (empties + focuses the first box), shake().
const OtpBoxes = forwardRef(function OtpBoxes({ id, onComplete }, ref) {
  const wrapRef = useRef(null);
  const inputs = () => Array.from(wrapRef.current.querySelectorAll('input'));
  const value = () => inputs().map(i => i.value).join('');

  useImperativeHandle(ref, () => ({
    value,
    clear() {
      inputs().forEach(i => { i.value = ''; i.classList.remove('filled'); });
      const first = inputs()[0];
      if (first) first.focus();
    },
    shake() {
      const boxes = wrapRef.current;
      boxes.classList.remove('shake');
      void boxes.offsetWidth;
      boxes.classList.add('shake');
    },
  }));

  useEffect(() => {
    const boxes = inputs();
    const cleanups = boxes.map((box, i) => {
      const onInput = () => {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        box.classList.toggle('filled', !!box.value);
        if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        if (value().length === boxes.length) onComplete(value());
      };
      const onKeyDown = e => {
        if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); }
        if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
      };
      const onPaste = e => {
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, boxes.length);
        if (!digits) return;
        e.preventDefault();
        digits.split('').forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add('filled'); });
        boxes[Math.min(digits.length, boxes.length - 1)].focus();
        if (digits.length === boxes.length) onComplete(value());
      };
      box.addEventListener('input', onInput);
      box.addEventListener('keydown', onKeyDown);
      box.addEventListener('paste', onPaste);
      return () => { box.removeEventListener('input', onInput); box.removeEventListener('keydown', onKeyDown); box.removeEventListener('paste', onPaste); };
    });
    return () => cleanups.forEach(fn => fn());
  });

  return (
    <div className="otp-boxes" id={id} ref={wrapRef}>
      <input type="text" inputMode="numeric" maxLength={1} autoComplete="one-time-code" aria-label="Digit 1" />
      <input type="text" inputMode="numeric" maxLength={1} aria-label="Digit 2" />
      <input type="text" inputMode="numeric" maxLength={1} aria-label="Digit 3" />
      <input type="text" inputMode="numeric" maxLength={1} aria-label="Digit 4" />
      <input type="text" inputMode="numeric" maxLength={1} aria-label="Digit 5" />
      <input type="text" inputMode="numeric" maxLength={1} aria-label="Digit 6" />
    </div>
  );
});

export default OtpBoxes;
