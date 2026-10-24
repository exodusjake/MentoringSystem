import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router.jsx';
import { installModalScrollLock, installScrollContainment, installSmoothScroll, installTooltips } from './app/globalBehaviors.js';
import { setNavigator } from './lib/events.js';
import { installInternalLinks } from './app/internalLinks.js';
import LoadingBar from './components/LoadingBar.jsx';
import MaintenanceScreen from './components/MaintenanceScreen.jsx';
import NotifyHost from './components/Notify.jsx';

installScrollContainment();
installModalScrollLock();
installSmoothScroll();
installTooltips();
setNavigator((path, options) => router.navigate(path, options));
installInternalLinks(router);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <NotifyHost />
      <LoadingBar />
      <MaintenanceScreen />
    </>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
