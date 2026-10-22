import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Draw-your-signature pad for the first-login setup. Strokes are kept as points so Undo works and the pad can be
// redrawn; the exported PNG has NO background (nothing is ever filled onto the canvas), is cropped to the ink and
// padded a little, so it prints cleanly over a signature line just like an uploaded transparent PNG.
const PENS = [
  { id: 'black', color: '#111827', label: 'Black ink' },
  { id: 'blue', color: '#1d3fae', label: 'Blue ink' },
];
const LINE_CSS_PX = 2.8;
const EXPORT_PAD = 10;

export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);        // [{ color, pts: [{ x, y }] }] in CSS pixels
  const drawing = useRef(null);
  const [pen, setPen] = useState('black');
  const [count, setCount] = useState(0);   // strokes drawn (re-renders the buttons / placeholder)
  const penColor = () => PENS.find(p => p.id === pen).color;

  // Match the canvas bitmap to its on-screen size (sharp on high-DPI screens).
  function fit() {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    redraw();
  }

  function paint(ctx, s, dpr) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = LINE_CSS_PX * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = s.pts;
    if (p.length === 1) {               // a dot
      ctx.beginPath();
      ctx.arc(p[0].x * dpr, p[0].y * dpr, (LINE_CSS_PX * dpr) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0].x * dpr, p[0].y * dpr);
    for (let i = 1; i < p.length - 1; i++) {     // smooth through the midpoints
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x * dpr, p[i].y * dpr, mx * dpr, my * dpr);
    }
    const last = p[p.length - 1];
    ctx.lineTo(last.x * dpr, last.y * dpr);
    ctx.stroke();
  }

  function redraw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);      // transparent: no background is ever painted
    const dpr = window.devicePixelRatio || 1;
    strokes.current.forEach(s => paint(ctx, s, dpr));
  }

  // Crop to the ink and hand the parent a transparent PNG File (or null when empty).
  function commit() {
    const c = canvasRef.current;
    if (!c || !strokes.current.length) { onChange(null); return; }
    const ctx = c.getContext('2d');
    const { width, height } = c;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { onChange(null); return; }
    const pad = Math.round(EXPORT_PAD * (window.devicePixelRatio || 1));
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1 + pad * 2;
    out.height = maxY - minY + 1 + pad * 2;
    out.getContext('2d').drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
    out.toBlob(blob => {
      if (!blob) { onChange(null); return; }
      onChange(new File([blob], 'signature.png', { type: 'image/png' }), out.toDataURL('image/png'));
    }, 'image/png');
  }

  useLayoutEffect(() => { fit(); }, []);
  useEffect(() => {
    const onResize = () => { fit(); commit(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pos = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = { color: penColor(), pts: [pos(e)] };
    strokes.current.push(drawing.current);
    redraw();
    setCount(strokes.current.length);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current.pts.push(pos(e));
    redraw();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = null;
    commit();
  }
  function undo() {
    strokes.current.pop();
    redraw();
    setCount(strokes.current.length);
    commit();
  }
  function clear() {
    strokes.current = [];
    redraw();
    setCount(0);
    onChange(null);
  }

  return (
    <div className="sig-pad">
      <div className="sig-pad-surface">
        <canvas ref={canvasRef} className="sig-pad-canvas" aria-label="Draw your signature here"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {count === 0 ? <div className="sig-pad-hint"><span>Sign here</span></div> : null}
        <div className="sig-pad-line" aria-hidden="true"></div>
      </div>
      <div className="sig-pad-tools">
        <div className="sig-pens" role="radiogroup" aria-label="Ink colour">
          {PENS.map(p => (
            <button key={p.id} type="button" role="radio" aria-checked={pen === p.id} title={p.label} aria-label={p.label}
              className={`sig-pen${pen === p.id ? ' active' : ''}`} style={{ '--pen': p.color }} onClick={() => setPen(p.id)}></button>
          ))}
        </div>
        <div className="sig-pad-btns">
          <button type="button" className="sig-tool-btn" onClick={undo} disabled={count === 0}>Undo</button>
          <button type="button" className="sig-tool-btn" onClick={clear} disabled={count === 0}>Clear</button>
        </div>
      </div>
    </div>
  );
}
