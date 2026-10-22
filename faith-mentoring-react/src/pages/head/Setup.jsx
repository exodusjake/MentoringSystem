import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';
import { PORTALS } from '../../lib/session.js';

// Head first-login signature setup (HEAD/HTML/setup.html).
export default function HeadSetup() {
  return (
    <SetupPage pageId="HEAD/setup" dashboard={PORTALS.head.home}
      sub={SETUP_TEXT.documents.sub}
      consent={SETUP_TEXT.documents.consent}
      privacy={SETUP_TEXT.documents.privacy} />
  );
}
