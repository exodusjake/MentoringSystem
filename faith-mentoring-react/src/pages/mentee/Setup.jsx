import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';
import { PORTALS } from '../../lib/session.js';

// Mentee first-login signature setup (MENTEE/HTML/setup.html).
export default function MenteeSetup() {
  return (
    <SetupPage pageId="MENTEE/setup" dashboard={PORTALS.mentee.home}
      sub={SETUP_TEXT.logsheets.sub}
      consent={SETUP_TEXT.logsheets.consent}
      privacy={"Your signature is personal data collected and used only to verify your attendance on mentoring session logsheets, in line with the Data Privacy Act of 2012 (RA 10173). It will only be visible to your assigned mentor and to program administrators, and will not be shared with anyone else."}
      queueWalkthrough />
  );
}
