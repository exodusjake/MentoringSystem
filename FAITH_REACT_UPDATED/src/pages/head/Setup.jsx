import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// HEAD/HTML/setup.html — also queues the one-time portal walkthrough for the dashboard.
export default function Setup() {
  const afterSave = userId => {
    try { localStorage.setItem('astra_walkthrough_head_pending_' + userId, '1'); localStorage.removeItem('astra_walkthrough_head_done_' + userId); } catch (e) {}
  };
  return <SetupPage pageId="HEAD/setup" dashboard="/head/dashboard" text={SETUP_TEXT.generated} afterSave={afterSave} />;
}
