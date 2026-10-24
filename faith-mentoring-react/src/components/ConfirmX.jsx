// The close (X) button the original confirm-dialog restyler added to small "title + message +
// Cancel/Confirm" dialogs (styled by .astra-confirm-x in responsive.css). It does what the
// dialog's first button (Cancel / Go Back) does.
export function ConfirmX({ onClick }) {
  return (
    <button type="button" className="astra-confirm-x" aria-label="Close"
      onClick={e => { e.stopPropagation(); onClick(e); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
