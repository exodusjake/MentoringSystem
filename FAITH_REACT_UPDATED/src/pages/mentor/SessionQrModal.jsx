import { useEffect, useRef, useState } from 'react';
import { showConfirm, showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import { apiRequest } from '../../lib/api.js';
import { checkpointWindow } from '../../lib/checkpoint-window.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { loadScript } from '../../lib/loadScript.js';

// The QR Scanner / Attendance modal of MENTOR/HTML/sessions.html (#qrScanModal) + the QR section of sessions.js.

function localISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function canFinishAttendance(session, rows, calendar) {
  if (!session || session.sessionStatus === 'Cancelled' || session.timeEnd) return false;
  const w = checkpointWindow(calendar, session.slotName, session.schoolYear, session.semester);
  return (!w.disabled && !w.upcoming) || rows.some(row => row.isPresent && row.scannedAt);
}

export default function SessionQrModal({ open, session, dateStr, calendar, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [listState, setListState] = useState('loading');     // 'loading' | 'ready' | 'failed'
  const [status, setStatus] = useState({ text: '', cls: '' });
  const [clock, setClock] = useState('--:-- --');
  const [saving, setSaving] = useState(false);
  const [canScan, setCanScan] = useState(false);

  const rowsRef = useRef([]);
  const sessionRef = useRef(session);
  const calendarRef = useRef(calendar);
  const scannedIds = useRef(new Set());
  const lastScanTime = useRef(0);
  const qrRef = useRef(null);
  const resetTimer = useRef(null);
  const clockTimer = useRef(null);
  sessionRef.current = session;
  calendarRef.current = calendar;

  const setRowsBoth = next => { rowsRef.current = next; setRows(next); };

  function showQrStatus(msg, type, persistent = false) {
    setStatus({ text: msg, cls: type });
    clearTimeout(resetTimer.current);
    if (persistent) return;
    resetTimer.current = setTimeout(() => setStatus({ text: 'Point camera at mentee QR code', cls: '' }), 2000);
  }

  async function stopQrScanner() {
    if (qrRef.current) {
      try { await qrRef.current.stop(); } catch (e) {}
      qrRef.current = null;
      const reader = document.getElementById('qr-reader');
      if (reader) reader.innerHTML = '';
    }
  }

  function startQrScanner() {
    const readerEl = document.getElementById('qr-reader');
    if (!readerEl) return;
    readerEl.innerHTML = '';
    qrRef.current = new window.Html5Qrcode('qr-reader');
    qrRef.current.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      handleQrScan,
      () => {}
    ).then(() => {
      setStatus({ text: 'Point camera at mentee QR code', cls: '' });
    }).catch(err => {
      setStatus({ text: 'Camera unavailable. Allow camera access and reopen the scanner. Attendance requires a QR scan.', cls: 'warn' });
      console.warn('QR scanner:', err);
    });
  }

  async function handleQrScan(decodedText) {
    const now = Date.now();
    if (now - lastScanTime.current < 1500) return;
    lastScanTime.current = now;

    const token = decodedText.trim();
    if (!token) { showQrStatus('Empty QR code', 'error'); return; }
    const sid = sessionRef.current?.sessionID;

    try {
      const result = await apiRequest('QRAttendance/scan', 'POST', { token, sessionId: sid }, true);

      if (!result.success) {
        showQrStatus(result.message || 'Invalid or expired QR', 'error');
        showToast(result.message || 'Invalid or expired QR code.', 'error', 3000);
        return;
      }
      const { menteeId, sessionId, menteeName } = result;
      if (sessionId !== sid) { showQrStatus('QR is for a different session', 'error'); return; }
      if (scannedIds.current.has(menteeId)) {
        showQrStatus(`${menteeName} already scanned`, 'warn');
        showToast(`${menteeName} was already scanned.`, 'info', 2500);
        return;
      }
      const row = rowsRef.current.find(r => r.menteeID === menteeId);
      if (!row) { showQrStatus('Mentee not in this session', 'error'); return; }

      scannedIds.current.add(menteeId);
      row.isPresent = true;
      row.attendanceUnverified = false;
      row.attendanceRecorded = true;
      row.scannedAt = localISO();
      setRowsBoth([...rowsRef.current]);
      // flashScanSuccess
      setStatus({ text: `✓ ${menteeName} — Saved!`, cls: 'success' });
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setStatus({ text: 'Ready — point at next QR code', cls: '' }), 1500);
      showToast(`${menteeName} marked present.`, 'success', 2500);
    } catch (e) {
      console.error('QR scan failed:', e);
      showQrStatus('Scan failed — try again', 'error');
    }
  }

  // ── open ──
  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    const s = session;
    const w = checkpointWindow(calendar, s.slotName, s.schoolYear, s.semester);
    const scan = s.sessionStatus !== 'Cancelled' && !w.disabled && !w.upcoming && !s.timeEnd;
    setCanScan(scan);
    setRowsBoth([]);
    scannedIds.current = new Set();
    lastScanTime.current = 0;
    setListState('loading');
    setSaving(false);
    clearTimeout(resetTimer.current);
    setStatus({ text: scan ? 'Starting camera...' : 'Attendance closed. Existing records remain available.', cls: '' });

    // Display Philippine time; the API records the authoritative finish instant.
    const updateClock = () => setClock(new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }));
    clearInterval(clockTimer.current);
    if (scan) { updateClock(); clockTimer.current = setInterval(updateClock, 1000); }
    if (scan) loadScript('/MENTOR/JS/html5-qrcode.min.js').catch(() => {});

    (async () => {
      try {
        const existing = await apiRequest(`SessionsAdmin/session/${s.sessionID}/mentees`, 'GET', null, true);
        if (cancelled) return;
        let built = [];
        if (existing && existing.length > 0) {
          built = existing.map(m => ({
            attendanceID: m.attendanceID,
            menteeID:     m.menteeID,
            menteeName:   `${m.menteeFirstName || ''} ${m.menteeLastName || ''}`.trim() || '—',
            section:      m.sectionCode || '',
            attendanceRecorded: Number(m.attendanceID) > 0,
            isPresent:    LogsheetData.attendanceState(m) === true,
            attendanceUnverified: m.isPresent === true && LogsheetData.attendanceState(m) !== true,
            scannedAt:    m.scannedAt || null,
            mentorNotes:  m.mentorNotes || '',
            // A dropped-out mentee with existing Attendance is a legitimate historical record — flag the row.
            isDropOut:    !!m.isDropOut,
          }));
          built.filter(r => r.isPresent).forEach(r => scannedIds.current.add(r.menteeID));
        } else if (s.isMakeup) {
          // Makeup session — load all approved requesters for this slot
          const requesters = await apiRequest(`SessionsAdmin/session/${s.sessionID}/requester`, 'GET', null, true).catch(() => null);
          if (cancelled) return;
          if (requesters && requesters.length > 0) {
            built = requesters.map(r => ({
              attendanceID: null,
              menteeID:     r.menteeID,
              menteeName:   `${r.menteeFirstName || ''} ${r.menteeLastName || ''}`.trim() || '—',
              section:      r.sectionCode || '',
              attendanceRecorded: false,
              isPresent:    false,
              scannedAt:    null,
              mentorNotes:  '',
            }));
          }
        }
        // A regular session's roster comes from the backend (assignment effective-date cutoff): an empty response
        // is an empty historical roster, not a reason to rebuild it from today's assignments.
        setRowsBoth(built);
        setListState('ready');
        if (scan) {
          await loadScript('/MENTOR/JS/html5-qrcode.min.js').catch(() => {});
          if (!cancelled) startQrScanner();
        } else showQrStatus('Attendance closed. Existing records remain available.', 'error', true);
      } catch (err) {
        if (cancelled) return;
        console.error('QR scanner setup failed:', err);
        setListState('failed');
        setStatus({ text: 'Could not load attendance.', cls: '' });
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(clockTimer.current);
      clearTimeout(resetTimer.current);
      stopQrScanner();
    };
  }, [open, session?.sessionID]);

  async function close() {
    clearInterval(clockTimer.current);
    await stopQrScanner();
    onClose();
  }

  async function saveQrAttendance() {
    const s = sessionRef.current;
    if (!s || !rowsRef.current.length || !canFinishAttendance(s, rowsRef.current, calendarRef.current)) return;
    const rows0 = rowsRef.current;
    const presentN = rows0.filter(r => r.isPresent).length;
    const absentN = rows0.length - presentN;
    const ok = await showConfirm(
      `Once you save, the attendance is final and QR scanning for this session closes. You will not be able to scan again.

${presentN} mentee${presentN !== 1 ? 's' : ''} scanned and will be marked present.${absentN ? ` ${absentN} mentee${absentN !== 1 ? 's' : ''} not scanned will be marked absent.` : ''}`,
      { title: 'Save attendance and finish session?', confirmText: 'Save & Close', cancelText: 'Keep Scanning' }
    );
    if (!ok) return;
    setSaving(true);
    try {
      const requests = rowsRef.current.map(row => {
        const payload = { SessionID: s.sessionID, MenteeID: row.menteeID, IsPresent: false };
        // Ensure an absent row exists; the API preserves attendance already saved by QR.
        return apiRequest('Attendance', 'POST', payload, true);
      });
      await Promise.all(requests);
      await apiRequest(`Sessions/${s.sessionID}/finish`, 'POST', {}, true);

      clearInterval(clockTimer.current);
      await stopQrScanner();
      onClose();
      showToast('Attendance saved and session finished.', 'success');
      await onSaved();
    } catch (err) {
      console.error('Save attendance failed:', err);
      showToast(err.message || 'Failed to save attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const present = rows.filter(r => r.isPresent).length;
  const total = rows.length;
  const saveDisabled = saving || listState !== 'ready' || !canFinishAttendance(session, rows, calendar);

  let list;
  if (listState === 'loading') list = <div className="list-skeleton"><span className="spinner"></span> Loading...</div>;
  else if (listState === 'failed') list = <div className="list-skeleton">Could not load attendance data.</div>;
  else if (!total) list = <div className="list-skeleton">No mentees found for this session.</div>;
  else {
    list = rows.map((m, idx) => {
      const parts = m.menteeName.split(' ');
      const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
      const section = m.section ? ` · ${m.section}` : '';
      const cls = !m.attendanceRecorded || m.attendanceUnverified ? '' : m.isPresent ? 'is-present' : 'is-absent';
      const icon = !m.attendanceRecorded || m.attendanceUnverified ? 'ti-minus' : m.isPresent ? 'ti-check' : 'ti-x';
      const label = m.attendanceUnverified ? 'Unverified' : !m.attendanceRecorded ? 'Not recorded' : m.isPresent ? 'Present' : 'Absent';
      return (
        <div className={`att-row${m.attendanceRecorded && !m.isPresent && !m.attendanceUnverified ? ' att-row-absent' : ''}`} key={m.menteeID ?? idx}>
          <div className="att-row-top">
            <div className="att-avatar">{initials}</div>
            <div className="att-name">{m.menteeName}<span className="att-section">{section}</span>{m.isDropOut ? <span className="att-dropout-chip">Drop Out</span> : null}</div>
            <span className={`att-presence-status ${cls}`}>
              <i className={`ti ${icon}`}></i> {label}
            </span>
          </div>
        </div>
      );
    });
  }

  return (
    <Overlay open={open} className="modal-overlay" activeClass="open" id="qrScanModal"
      onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal-card qr-modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={close}>
          <i className="ti ti-x"></i>
        </button>
        <h2 className="modal-title">{canScan ? 'Scan Attendance' : 'View Attendance'}</h2>
        <p className="modal-subtitle" id="qrScanDate">{dateStr || '—'}</p>

        <div className="qr-reader-wrap">
          <div id="qr-reader" style={{ display: canScan ? '' : 'none' }}></div>
          <div className={`qr-status${status.cls ? ' ' + status.cls : ''}`} id="qrStatus">{status.text}</div>
        </div>

        <div className="qr-att-summary">
          <div className="qr-att-label"><i className="ti ti-users"></i> Attendance</div>
          <div className="qr-att-count" id="qrAttCount">{present} / {total} present</div>
        </div>

        <div id="qrAttList" className="attendance-list">{list}</div>

        <div className="qr-end-time-row" style={{ display: canScan ? '' : 'none' }}>
          <div className="qr-end-label">
            <i className="ti ti-clock-off"></i>
            Session End Time
          </div>
          <div className="qr-end-display-wrap">
            <span id="qrEndTimeDisplay" className="qr-end-display">{clock}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-form-cancel" onClick={close}>Cancel</button>
          <button className="btn-form-submit" id="saveQrAttBtn" onClick={saveQrAttendance} disabled={saveDisabled}>
            {saving ? 'Saving...' : <><i className="ti ti-check"></i> Save &amp; Close</>}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
