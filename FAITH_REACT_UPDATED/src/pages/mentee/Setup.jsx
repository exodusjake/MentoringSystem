import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// MENTEE/HTML/setup.html — also queues the one-time portal walkthrough for the dashboard.
export default function Setup() {
  const afterSave = userId => {
    try { localStorage.setItem('astra_walkthrough_pending_' + userId, '1'); localStorage.removeItem('astra_walkthrough_done_' + userId); } catch (e) {}
  };
  return <SetupPage pageId="MENTEE/setup" dashboard="/mentee/dashboard" text={SETUP_TEXT.mentee} afterSave={afterSave} />;
}
