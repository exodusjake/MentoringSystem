import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { PORTALS, roleKey } from '../lib/session.js';
import { LEGACY_PATHS, legacyTarget } from './legacyRedirects.js';
import PortalLayout from './PortalLayout.jsx';
import { PORTAL_CONFIG } from './portals.js';
import { PAGES } from '../pages/index.js';
import TourProvider from '../pages/mentee/tour/Walkthrough.jsx';

// `/` (the old index.html): straight to the signed-in role's dashboard, else the landing page.
function RootRedirect() {
  const role = localStorage.getItem('role');
  if (!role) return <Navigate to="/landing" replace />;
  const portal = PORTALS[roleKey(role)];
  return <Navigate to={portal ? portal.home : '/login'} replace />;
}

function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={(legacyTarget(pathname, search) || '/') + hash} replace />;
}

// Each page is its own chunk. While it loads nothing is shown (the portal skeleton covers the
// content area, as the original did between page loads).
const page = key => {
  const Component = lazy(PAGES[key]);
  return <Suspense fallback={null}><Component /></Suspense>;
};

const portalRoutes = (key, children) => ({
  path: PORTAL_CONFIG[key].base.slice(1),
  children: [
    { index: true, element: <Navigate to={PORTALS[key].home} replace /> },
    { path: 'setup', element: page(`${key}/setup`) },
    { element: <PortalLayout config={PORTAL_CONFIG[key]} wrap={key === 'mentee' ? TourProvider : undefined} />, children },
  ],
});

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/landing', element: page('landing') },
  { path: '/privacy', element: page('privacy') },
  { path: '/terms', element: page('terms') },
  { path: '/login', element: page('login') },

  portalRoutes('admin', [
    { path: 'dashboard', element: page('admin/dashboard') },
    { path: 'users', element: page('admin/users') },
    { path: 'attendance', element: page('admin/attendance') },
    { path: 'attendance/:id', element: page('admin/attendance-detail') },
    { path: 'monitoring', element: page('admin/monitoring') },
    { path: 'monitoring/:id', element: page('admin/monitoring-detail') },
    { path: 'proofs', element: page('admin/proofs') },
    { path: 'report', element: page('admin/report') },
    { path: 'announcements', element: page('admin/announcements') },
    { path: 'calendar', element: page('admin/calendar') },
    { path: 'evaluations', element: page('admin/evaluations') },
    { path: 'profile', element: page('admin/profile') },
    { path: 'settings', element: page('admin/settings') },
  ]),
  portalRoutes('head', [
    { path: 'dashboard', element: page('head/dashboard') },
    { path: 'monitoring', element: page('head/monitoring') },
    { path: 'monitoring/:id', element: page('head/monitoring-detail') },
    { path: 'attendance', element: page('head/attendance') },
    { path: 'attendance/:id', element: page('head/attendance-detail') },
    { path: 'proofs', element: page('head/proofs') },
    { path: 'report', element: page('head/report') },
    { path: 'announcements', element: page('head/announcements') },
    { path: 'calendar', element: page('head/calendar') },
    { path: 'evaluations', element: page('head/evaluations') },
    { path: 'account', element: page('head/account') },
  ]),
  portalRoutes('mentor', [
    { path: 'dashboard', element: page('mentor/dashboard') },
    { path: 'mentees', element: page('mentor/mentees') },
    { path: 'attendance', element: page('mentor/attendance') },
    { path: 'sessions', element: page('mentor/sessions') },
    { path: 'availability', element: page('mentor/availability') },
    { path: 'logsheet', element: page('mentor/logsheet') },
    { path: 'announcements', element: page('mentor/announcements') },
    { path: 'calendar', element: page('mentor/calendar') },
    { path: 'profile', element: page('mentor/profile') },
  ]),
  portalRoutes('mentee', [
    { path: 'dashboard', element: page('mentee/dashboard') },
    { path: 'schedule', element: page('mentee/schedule') },
    { path: 'sessions', element: page('mentee/sessions') },
    { path: 'announcements', element: page('mentee/announcements') },
    { path: 'profile', element: page('mentee/profile') },
  ]),

  ...LEGACY_PATHS.map(path => ({ path, element: <LegacyRedirect /> })),
  { path: '*', element: <Navigate to="/" replace /> },
]);
