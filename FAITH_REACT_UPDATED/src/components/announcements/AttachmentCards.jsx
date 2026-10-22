import { CONFIG } from '../../lib/config.js';
import { attachIcon, fileUrl, formatFileSize } from '../../lib/attachments.js';

// renderAttachmentSection(announcementID): the clickable attachment cards under a post. `onView(attachment)` opens
// the lightbox; the download button opens the API's download URL in a new tab.
export default function AttachmentCards({ attachments, onView }) {
  if (!attachments.length) return null;
  return (
    <div className="attach-list attach-list--card">
      {attachments.map(a => (
        <div className="attach-item--card" key={a.attachmentID}>
          <a className="attach-item--card-link" href={fileUrl(a.filePath)} onClick={e => { e.preventDefault(); onView(a); }}>
            <i className={`ti ${attachIcon(a.fileName)} attach-icon`}></i>
            <span className="attach-name">{a.fileName}</span>
            <span className="attach-size">{formatFileSize(a.fileSize)}</span>
          </a>
          <button className="attach-download" title="Download" onClick={() => window.open(`${CONFIG.API_BASE_URL}/AnnouncementAttachments/${a.attachmentID}/download`, '_blank')}>
            <i className="ti ti-download"></i>
          </button>
        </div>
      ))}
    </div>
  );
}
