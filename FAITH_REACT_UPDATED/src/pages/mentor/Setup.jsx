import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// MENTOR/HTML/setup.html — also queues the one-time portal walkthrough for the dashboard.
export default function Setup() {
  const afterSave = userId => {
    try { localStorage.setItem('astra_walkthrough_mentor_pending_' + userId, '1'); localStorage.removeItem('astra_walkthrough_mentor_done_' + userId); } catch (e) {}
  };
  return <SetupPage pageId="MENTOR/setup" dashboard="/mentor/dashboard" text={SETUP_TEXT.mentor} afterSave={afterSave} />;
}
