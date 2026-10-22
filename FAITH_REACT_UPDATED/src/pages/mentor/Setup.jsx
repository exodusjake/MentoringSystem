import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// MENTOR/HTML/setup.html
export default function Setup() {
  return <SetupPage pageId="MENTOR/setup" dashboard="/mentor/dashboard" text={SETUP_TEXT.mentor} />;
}
