import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// ADMIN_/HTML/setup.html — also queues the one-time portal walkthrough for the dashboard.
export default function Setup() {
  const afterSave = userId => {
    try { localStorage.setItem('astra_walkthrough_admin_pending_' + userId, '1'); localStorage.removeItem('astra_walkthrough_admin_done_' + userId); } catch (e) {}
  };
  return <SetupPage pageId="ADMIN_/setup" dashboard="/admin/dashboard" text={SETUP_TEXT.generated} afterSave={afterSave} />;
}
