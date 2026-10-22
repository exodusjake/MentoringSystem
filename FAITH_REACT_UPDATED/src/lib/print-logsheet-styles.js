// ===== SHARED LOGSHEET PRINT STYLES =====
// One source for the printed Mentoring Logsheet / Mentor's Notes /
// Non-Attendance forms across every portal that can print them (Mentor's
// own Logsheet page, Admin's Sessions Detail page, Head's Mentor Detail
// page). Before this file existed, each portal kept its own copy of this
// CSS — they'd drifted apart in class naming (Admin used a `.paper-*`
// convention, Mentor/Head used `.form-page`/`.sig-*`) even though the
// values had already been hand-matched to look identical. This file
// carries BOTH class families side by side, values kept in lockstep on
// purpose, so a future tweak only has to happen once, here, instead of
// being copied into three files (and silently missed in one of them).
//
// Usage: each portal's own print-window builder calls
// getLogsheetPrintStyles(accentColor, accentHoverColor) and embeds the
// returned string in its own <style> tag — this stays a plain string,
// not a stylesheet <link>, because the print output is always a
// window.open()+document.write() popup, not a normal page navigation.
//
// accentColor / accentHoverColor: each portal's own brand color for the
// "Print / Save as PDF" button — Admin's is blue (#2563eb / #1d4ed8),
// Mentor's and Head's are teal (#0f766e / #0d6560). Everything else on
// the printed page itself is intentionally colorless (#111/#555/#f3f4f6)
// so the paper form looks the same regardless of which portal printed it.
function getLogsheetPrintStyles(accentColor = '#0f766e', accentHoverColor = '#0d6560') {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }

    /* ── Action bar (screen only — hidden when actually printing) ── */
    .action-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e293b; color: #fff;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 24px; z-index: 100; font-family: Arial, sans-serif; font-size: 13px; gap: 12px; }
    .action-bar-title { font-weight: 600; font-size: 13px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action-bar-btns { display: flex; gap: 8px; flex-shrink: 0; }
    .ab-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
    .ab-btn-print { background: ${accentColor}; color: #fff; }
    .ab-btn-print:hover { background: ${accentHoverColor}; }
    .ab-btn-close { background: #334155; color: #e2e8f0; }
    .ab-btn-close:hover { background: #475569; }
    /* .print-wrap (Mentor/Head): no padding of its own — .form-page
       already carries its own page padding. .print-body (Admin): the
       page padding lives on THIS wrapper instead, since .paper-form has
       none — same visual margin, different place it's declared. */
    .print-wrap { margin-top: 56px; }
    .print-body { margin-top: 56px; padding: 18mm 20mm; }
    @media print {
      .action-bar { display: none; }
      .print-wrap { margin-top: 0; }
      .print-body { margin-top: 0; padding: 15mm 18mm; }
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    @page { size: A4; margin: 0; }

    /* ── Mentor/Head naming (.form-page / .sig-*) ──────────────────── */
    .form-page { padding: 28px 36px 24px; min-height: 100vh; page-break-after: always; break-after: page; }
    .form-page:last-child { page-break-after: avoid; break-after: avoid; }
    .header { text-align: center; margin-bottom: 14px; }
    .logo { height: 50px; margin-bottom: 6px; }
    .school-name { font-size: 18px; font-weight: 900; letter-spacing: 0.08em; }
    .sub  { font-size: 11px; font-weight: 600; }
    .doc-title { margin-top: 6px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-decoration: underline; }
    .session-label { margin-bottom: 8px; font-size: 11px; font-weight: 600; }
    .session-underline { border-bottom: 1.5px solid #111; padding-bottom: 1px; margin-right: 4px; }
    .form-footer { margin-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; break-inside: avoid; }
    .sig-block { font-size: 10px; max-width: 220px; }
    .sig-fit { display: inline-block; text-align: center; }
    /* Matches .paper-date-block (modal view): flex:1 so this grows to
       fill the row up to its own max-width instead of shrinking to just
       "DATE"'s own text width — that mismatch was the printed date line
       coming out noticeably shorter than what the on-screen modal shows. */
    .date-block { flex: 1; max-width: 150px; }
    .sig-name { font-weight: 700; font-size: 11px; }
    .sig-line { border-bottom: 1.5px solid #111; margin-top: 8px; }
    .sig-role { font-size: 9px; letter-spacing: 0.04em; margin-top: 2px; }
    .notes-page { padding: 28px 36px 24px; page-break-after: always; break-after: page; display: flex; flex-direction: column; min-height: 100vh; }
    .notes-page:last-child { page-break-after: avoid; break-after: avoid; }
    .guidance-copy { text-align: right; font-size: 10px; font-style: italic; font-weight: 700; margin-bottom: 4px; }
    .notes-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; }
    .notes-sig-block { font-size: 10px; max-width: 220px; }
    .notes-date-block { flex: 1; max-width: 150px; }
    .notes-sig-name { font-weight: 700; font-size: 11px; }
    .notes-sig-line { border-bottom: 1.5px solid #111; margin-top: 8px; }
    .notes-sig-role { font-size: 9px; letter-spacing: 0.04em; color: #555; margin-top: 2px; }
    .na-page { padding: 28px 36px 24px; page-break-after: always; break-after: page; }
    .na-page:last-child { page-break-after: avoid; break-after: avoid; }
    .na-letter { margin: 14px 0 10px; font-size: 11px; line-height: 1.6; }
    .na-letter p { margin-bottom: 4px; }
    .na-mentor-row { display: flex; gap: 40px; margin-bottom: 10px; font-size: 11px; flex-wrap: wrap; }
    .na-field { display: inline-flex; align-items: center; gap: 4px; }
    .na-field-val { display: inline-block; border-bottom: 1px solid #111; min-width: 140px; padding-bottom: 1px; font-weight: 700; }
    .na-sig-blank { min-width: 120px; }
    .na-ack-title { font-size: 13px; font-weight: 700; text-align: center; letter-spacing: 0.06em; }
    .na-ack-sub { font-size: 11px; font-weight: 700; text-align: center; margin-bottom: 10px; }
    .na-ack-fields { display: flex; flex-direction: column; gap: 6px; }
    .na-ack-field { display: flex; align-items: center; gap: 8px; font-size: 11px; }
    .ack-label { font-weight: 700; white-space: nowrap; }

    /* ── Admin naming (.paper-* / .print-all-page) — same visual result
       as the block above, just a different set of class names on the
       same kind of markup. Values below are intentionally identical to
       their .form-page-family counterparts; change one, change both. ── */
    .print-all-page { page-break-after: always; break-after: page; }
    .print-all-page:last-child { page-break-after: auto; break-after: auto; }
    .paper-header { text-align: center; margin-bottom: 12px; }
    .paper-logo-img { height: 50px; margin-bottom: 6px; }
    .paper-school-name { font-size: 18px; font-weight: 900; letter-spacing: 0.08em; color: #111; }
    .paper-program { font-size: 11px; font-weight: 600; color: #111; margin-top: 2px; }
    .paper-form-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-align: center; text-decoration: underline; color: #111; margin: 8px 0 6px; }
    .paper-session-label { font-size: 11px; font-weight: 600; margin-bottom: 8px; }
    .paper-session-underline { border-bottom: 1.5px solid #111; padding-bottom: 1px; margin-right: 4px; }
    .paper-program-sub { font-size: 11px; color: #555; text-align: center; margin-bottom: 6px; }
    .paper-sig-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-top: 24px; page-break-inside: avoid; break-inside: avoid; }
    .paper-sig-block { flex: 1; }
    .paper-sig-block.wide { flex: 0 1 auto; max-width: 220px; }
    .paper-sig-fit { display: inline-block; text-align: center; }
    .paper-sig-value { font-size: 11px; font-weight: 700; }
    .paper-sig-line { border-bottom: 1.5px solid #111; margin-top: 8px; }
    .paper-sig-label { font-size: 9px; margin-top: 3px; color: #555; letter-spacing: 0.02em; }
    .guidance-copy-label { text-align: right; font-size: 10px; font-style: italic; font-weight: 700; margin-bottom: 4px; }
    .na-instruction { font-size: 11px; line-height: 1.8; margin: 12px 0; }
    .na-field-label { font-weight: 700; white-space: nowrap; }
    .na-field-value { border-bottom: 1px solid #333; flex: 1; min-height: 20px; padding: 2px 6px; font-size: 12px; font-weight: 600; }
    .na-ack-title, .na-ack-sub { color: inherit; }

    /* ── Shared regardless of naming — tables, note lines, non-attendance
       acknowledgement box all use the SAME class names in every portal
       already, so only one copy of each is needed. ── */
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { border: 1px solid #111; padding: 6px 8px; font-size: 10px; font-weight: 700; text-align: center; background: #f3f4f6; text-transform: uppercase; }
    td { border: 1px solid #111; padding: 5px 8px; height: 22px; font-size: 11px; vertical-align: middle; }
    .sig-cell { min-width: 130px; }
    .section-group-header { background: #f3f4f6; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #374151; padding: 5px 8px !important; }
    .note-entries { margin-top: 14px; }
    .note-entry { margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
    .note-entry-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px; flex-wrap: wrap; }
    .note-field { font-size: 11px; }
    .note-field-val { display: inline-block; border-bottom: 1px solid #111; min-width: 140px; padding-bottom: 1px; }
    .note-field-blank { display: inline-block; border-bottom: 1px solid #111; min-width: 160px; }
    .note-line { border-bottom: 1px solid #555; height: 18px; margin: 2px 0; }
    .note-line-pre { border-bottom: 1px solid #555; height: 18px; margin: 2px 0; padding: 2px 4px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
    .na-note { font-size: 10.5px; color: #555; margin-top: 8px; }
    .na-all-present { text-align: center; padding: 20px; color: #16a34a; font-size: 12px; font-weight: 600; }
    .na-ack { margin-top: 24px; border: 1.5px solid #333; padding: 14px 16px; }
    .ack-val { border-bottom: 1px solid #333; flex: 1; min-height: 20px; padding: 0 6px; font-size: 11.5px; font-weight: 400; }
    .ack-blank { color: transparent !important; }
  `;
}

export { getLogsheetPrintStyles };
