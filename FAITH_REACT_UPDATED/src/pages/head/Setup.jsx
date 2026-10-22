import SetupPage, { SETUP_TEXT } from '../shared/SetupPage.jsx';

// HEAD/HTML/setup.html
export default function Setup() {
  return <SetupPage pageId="HEAD/setup" dashboard="/head/dashboard" text={SETUP_TEXT.generated} />;
}
