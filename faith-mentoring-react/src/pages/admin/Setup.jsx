import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';
import { PORTALS } from '../../lib/session.js';

// Admin first-login signature setup (ADMIN_/HTML/setup.html).
export default function AdminSetup() {
  return (
    <SetupPage pageId="ADMIN_/setup" dashboard={PORTALS.admin.home}
      sub={SETUP_TEXT.documents.sub}
      consent={SETUP_TEXT.documents.consent}
      privacy={SETUP_TEXT.documents.privacy} />
  );
}
