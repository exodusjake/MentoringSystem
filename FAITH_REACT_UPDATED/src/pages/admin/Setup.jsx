import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// ADMIN_/HTML/setup.html
export default function Setup() {
  return <SetupPage pageId="ADMIN_/setup" dashboard="/admin/dashboard" text={SETUP_TEXT.generated} />;
}
