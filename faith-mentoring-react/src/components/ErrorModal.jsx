import { ConfirmX } from './ConfirmX.jsx';

// The Head/Admin "Something went wrong" alert (#errorModal, .info-modal), with the original
// confirm-dialog restyle applied: its lone OK button sits in an .astra-single actions row and a
// close X is added. `message` stays after closing, as the original's text did.
// `prefix` / ids / button class cover the calendar's .cal-info-modal variant.
export default function ErrorModal({ open, message, onClose, iconClass = 'danger', title = 'Something went wrong', buttonStyle = { width: '100%', justifyContent: 'center' },
  prefix = 'info-modal', id = 'errorModal', messageId = 'errorMessage', buttonClass = 'btn-primary' }) {
  return (
    <div id={id} className={prefix + '-overlay'} style={{ display: open ? 'flex' : 'none' }}>
      <div className={prefix} data-astra-confirm="1">
        <div className={`${prefix}-icon ${iconClass}`} data-ac="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        {' '}
        <h3 className={prefix + '-title'} data-ac="title">{title}</h3>
        {' '}
        <p className={prefix + '-message'} id={messageId} data-ac="body">{message}</p>
        {' '}
        <div className="astra-single" data-ac="actions">
          <button className={buttonClass} onClick={onClose} style={buttonStyle}>OK</button>
        </div>
        <ConfirmX onClick={onClose} />
      </div>
    </div>
  );
}
