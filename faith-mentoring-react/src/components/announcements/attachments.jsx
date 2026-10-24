import { CONFIG } from '../../lib/config.js';

// Attachment list shared by announcement and evaluation cards.
export const fileUrl = path => CONFIG.API_BASE_URL.replace('/api', '') + path;

export function attachIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'ti-photo';
  if (['pdf'].includes(ext)) return 'ti-file-type-pdf';
  if (['doc', 'docx'].includes(ext)) return 'ti-file-type-doc';
  if (['xls', 'xlsx'].includes(ext)) return 'ti-file-spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'ti-presentation';
  if (['zip', 'rar', '7z'].includes(ext)) return 'ti-file-zip';
  return 'ti-paperclip';
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The Mentor and Head/Admin pages had their own copies with a slightly different icon set and size
// formatting; they pass these instead.
export function attachIconBasic(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'ti-photo';
  if (ext === 'pdf') return 'ti-file-type-pdf';
  if (['doc', 'docx'].includes(ext)) return 'ti-file-type-doc';
  if (['xls', 'xlsx'].includes(ext)) return 'ti-file-spreadsheet';
  if (['ppt', 'pptx'].includes(ext)) return 'ti-presentation';
  return 'ti-file';
}
export function formatFileSizeBasic(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Announcement attachments open in the lightbox (onView); evaluation attachments open in a new tab.
export function AttachmentList({ items, onView, downloadPath, icon = attachIcon, size = formatFileSize }) {
  if (!items.length) return null;
  return (
    <div className="attach-list attach-list--card">
      {items.map(a => (
        <div className="attach-item--card" key={a.attachmentID}>
          <a className="attach-item--card-link" href={fileUrl(a.filePath)}
            {...(onView ? { onClick: e => { e.preventDefault(); onView(a); } } : { target: '_blank', rel: 'noopener' })}>
            <i className={`ti ${icon(a.fileName)} attach-icon`}></i>
            {' '}
            <span className="attach-name">{a.fileName}</span>
            {' '}
            <span className="attach-size">{size(a.fileSize)}</span>
          </a>
          {' '}
          <button className="attach-download" title="Download"
            onClick={() => window.open(`${CONFIG.API_BASE_URL}/${downloadPath}/${a.attachmentID}/download`, '_blank')}>
            <i className="ti ti-download"></i>
          </button>
        </div>
      ))}
    </div>
  );
}
