import { ConfirmX } from './ConfirmX.jsx';

// The small "icon + title + message + buttons" dialog (.modal-card.modal-card-sm), with the
// original confirm-dialog restyle applied (data-ac markers and the close X, which does what the
// first button does; `closeX` when that differs from `onClose`). `children` are the action buttons;
// `single` marks a one-button dialog.
export default function ConfirmDialog({ id, open, onClose, closeX, iconClass = '', icon, iconId, title, titleId, body, bodyId, single, children }) {
  return (
    <div id={id} className={'modal-overlay' + (open ? ' open' : '')} style={{ display: open ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card modal-card-sm" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
        <div className={'confirm-icon' + (iconClass ? ' ' + iconClass : '')} data-ac="icon">
          <i className={'ti ' + icon} id={iconId}></i>
        </div>
        {' '}
        <h3 className="confirm-title" id={titleId} data-ac="title">{title}</h3>
        {' '}
        <p className="confirm-body" id={bodyId} data-ac="body">{body}</p>
        {' '}
        <div className={'confirm-actions' + (single ? ' astra-single' : '')} data-ac="actions">{children}</div>
        <ConfirmX onClick={closeX || onClose} />
      </div>
    </div>
  );
}
