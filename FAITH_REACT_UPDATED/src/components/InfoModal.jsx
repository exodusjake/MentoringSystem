import Overlay from './Overlay.jsx';

// The "info-modal" dialogs the portal pages each built from markup: a confirmation (#confirmModal) and an
// error alert (#errorModal).

const DELETE_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>;
const CONFIRM_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="9 11 12 14 22 4" /></svg>;
const ERROR_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;

// confirm = { title, message, type: 'delete' | 'update' | 'post', onConfirm } or null.
// (showConfirmModal(title, message, type, onConfirm) in the announcement scripts.)
export function ConfirmModal({ confirm, onClose }) {
  const type = confirm?.type;
  return (
    <Overlay open={!!confirm} className="info-modal-overlay" activeClass={null} display="flex" id="confirmModal">
      <div className="info-modal">
        <div className={`info-modal-icon ${type === 'delete' ? 'danger' : 'confirm'}`} id="confirmIcon">{type === 'delete' ? DELETE_ICON : CONFIRM_ICON}</div>
        <h3 className="info-modal-title" id="confirmTitle">{confirm?.title ?? 'Confirm'}</h3>
        <p className="info-modal-message" id="confirmMessage">{confirm?.message ?? 'Are you sure?'}</p>
        <div className="info-modal-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className={type === 'delete' ? 'btn-danger' : 'btn-primary'} id="confirmOkBtn"
            onClick={() => { const fn = confirm.onConfirm; onClose(); fn(); }}>
            {type === 'delete' ? 'Delete' : type === 'update' ? 'Update' : type === 'post' ? 'Post' : 'Confirm'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// message = string or null (closed).
export function ErrorModal({ message, onClose }) {
  return (
    <Overlay open={message !== null && message !== undefined} className="info-modal-overlay" activeClass={null} display="flex" id="errorModal">
      <div className="info-modal">
        <div className="info-modal-icon danger">{ERROR_ICON}</div>
        <h3 className="info-modal-title">Something went wrong</h3>
        <p className="info-modal-message" id="errorMessage">{message ?? 'An error occurred.'}</p>
        <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>OK</button>
      </div>
    </Overlay>
  );
}
