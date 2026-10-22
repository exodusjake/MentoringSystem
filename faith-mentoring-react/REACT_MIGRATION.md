# React Rewrite — Plan & Progress

Goal: rewrite the Astra Mentoring frontend as a React single-page app with React Router and clean
URLs, preserving behavior from the canonical legacy app at
`../FAITH_mentoring_system-main/FAITH_mentoring_system-main`.

Stack: React 19.2, React Router 6.30 (data router), Vite 8. Vite compiles JSX itself (no
`@vitejs/plugin-react`, which isn't available offline, so there's no Fast Refresh in dev).

## Conventions

- **Same DOM, same CSS.** Pages render the same element structure and class names as the original
  markup. Stylesheets stay in `public/` unchanged. Each route declares its stylesheets in the
  original `<head>` order, and `usePageStyles()` adds them on enter and removes them on leave,
  because the portals reuse class names with different rules (`.page-header` is styled in 26 files).
  Content is held hidden until those stylesheets have loaded, so there's no unstyled flash.
- **No `innerHTML` for UI.** Lists, tables and modals are JSX. User-provided rich text that the
  original rendered as HTML (announcements) is still sanitized exactly as before.
- **No inline handlers or globals.** `onclick="fn()"` becomes `onClick`. Cross-page helpers are
  ES modules in `src/lib/`.
- **API and business logic are unchanged.** `src/lib/api.js` keeps the original request
  semantics (auth header, 401 → login, 503 → maintenance screen, upload validation, timeouts,
  shared in-flight GETs). Pure logic modules (logsheet-data, checkpoint-window,
  dashboard-sessions, attendance-metrics, …) are ported as-is with exports.
- **Navigation** uses router links/`navigate()`. Every old `.html` URL redirects to its new route
  (query strings kept), so bookmarks and emailed links keep working.

## Per-page enhancers

In the original, each page loaded its own subset of shared UI scripts, so the same control looks
different from page to page (a `<select>` is a themed dropdown only where `ui-dropdown.js` was
loaded). Each route declares these flags; shared components read them from page context.

| Flag | Original script | Pages |
|---|---|---|
| `select` | ui-dropdown | A: announcements, attendance-detail, attendance-logs, calendar-events, session-proofs, sessions-detail, sessions, user-management · H: announcements, attendance-detail, attendance-summary, calendar, evaluation-ratings, mentor-detail, mentor-performance, proof-tracking · MR: announcements, availability, calendar, logsheet, my-activities, my-mentees, sessions · ME: sessions |
| `date` | ui-datepicker | A: calendar-events, evaluation-forms, session-proofs · H: proof-tracking · MR: availability, calendar, sessions |
| `time` | ui-timepicker | MR: availability, sessions |
| `modalMotion` | modal-motion | A: announcements, calendar-events, evaluation-forms, user-management · H: announcements |
| `emptyStates` | empty-states | every portal page except setup |
| portal chrome | sidebar-indicator, smooth-scroll | every portal page except setup; smooth-scroll also on landing/privacy/terms |
| tooltips | tooltips (via apiClient) | every page except index and landing/privacy/terms |

## Route map

| Old URL | New route |
|---|---|
| `/`, `/index.html` | `/` → role dashboard, or `/landing` |
| `/LANDING/HTML/landing.html` · `privacy.html` · `terms.html` | `/landing` · `/privacy` · `/terms` |
| `/LOGIN/HTML/login.html` | `/login` |
| **Admin** `/ADMIN_/HTML/…` | `/admin/…` |
| `dashboard.html` | `/admin/dashboard` |
| `user-management.html?role=&engagement=` | `/admin/users?…` |
| `attendance-logs.html?school=` | `/admin/attendance?…` |
| `attendance-detail.html?id=&school=` | `/admin/attendance/:id?school=` |
| `sessions.html?status=&school=` | `/admin/monitoring?…` |
| `sessions-detail.html?id=&school=` | `/admin/monitoring/:id?school=` |
| `session-proofs.html` | `/admin/proofs` |
| `evaluation-ratings.html` | `/admin/report` |
| `announcements.html?id=` | `/admin/announcements?id=` |
| `calendar-events.html` | `/admin/calendar` |
| `evaluation-forms.html` | `/admin/evaluations` |
| `profile.html` · `settings.html` · `setup.html` | `/admin/profile` · `/admin/settings` · `/admin/setup` |
| **Head** `/HEAD/HTML/…` | `/head/…` |
| `head-dashboard.html` | `/head/dashboard` |
| `mentor-performance.html?school=&status=` | `/head/monitoring?…` |
| `mentor-detail.html?id=&school=` | `/head/monitoring/:id?school=` |
| `attendance-summary.html?school=` | `/head/attendance?…` |
| `attendance-detail.html?id=&school=` | `/head/attendance/:id?school=` |
| `proof-tracking.html` · `evaluation-ratings.html` | `/head/proofs` · `/head/report` |
| `announcements.html` · `calendar.html` · `evaluation-forms.html` | `/head/announcements` · `/head/calendar` · `/head/evaluations` |
| `account.html` · `setup.html` | `/head/account` · `/head/setup` |
| **Mentor** `/MENTOR/HTML/…` | `/mentor/…` |
| `mentor-dashboard.html` | `/mentor/dashboard` |
| `my-mentees.html` · `my-activities.html` | `/mentor/mentees` · `/mentor/attendance` |
| `sessions.html?id=` · `availability.html` · `logsheet.html` | `/mentor/sessions?id=` · `/mentor/availability` · `/mentor/logsheet` |
| `announcements.html?id=` · `calendar.html` | `/mentor/announcements?id=` · `/mentor/calendar` |
| `profile.html` · `setup.html` | `/mentor/profile` · `/mentor/setup` |
| **Mentee** `/MENTEE/HTML/…` | `/mentee/…` |
| `mentee-dashboard.html` | `/mentee/dashboard` |
| `schedule-session.html` · `sessions.html?id=` | `/mentee/schedule` · `/mentee/sessions?id=` |
| `announcements.html?id=` · `profile.html` · `setup.html` | `/mentee/announcements?id=` · `/mentee/profile` · `/mentee/setup` |

## Phases

Each phase is verified against the canonical legacy app before the next starts: screenshots at 1440px and
390px (pixel diff), console errors, the interaction flows for that area, and mock-API data paths.

- [x] 0. Foundation: scaffold, router + legacy redirects, `lib/` (config, session, api, logic
      modules), auth/role/setup guard, portal layout + sidebar, page-style loader, theme, toasts
      and confirm dialogs, modal, themed select/date/time inputs, empty states, tooltips,
      maintenance screen, loading bar, logout effect, smooth scroll
- [x] 1. Public: landing, privacy, terms, login (sign-in, OTP, forgot password, contact)
- [x] 2. Mentee: dashboard, schedule, sessions, announcements, profile, setup (all four roles), walkthrough
- [x] 3. Mentor: dashboard, availability, sessions, logsheet, calendar, mentees, attendance,
      announcements, profile, setup (plus the themed date/time pickers, shared announcement
      components, ConfirmDialog, and the mentor print forms)
- [ ] 4. Head (all page routes wired; core workflows implemented, parity validation remains): dashboard, monitoring + detail, attendance + detail, proofs,
      report, announcements, calendar, evaluations, account, setup
- [ ] 5. Admin (all page routes wired; core workflows implemented, parity validation remains): dashboard, users, attendance + detail, monitoring + detail, proofs, report,
      announcements, calendar, evaluations, profile, settings, setup
- [ ] 6. Deploy: Nginx SPA fallback config added (not yet validated with nginx), deploy script,
      README, comprehensive test suite

All 46 public and portal route entries now resolve to React page modules, and the old
`.html` entry points redirect through the route map. A browser smoke sweep loaded all 46 React
routes with empty mock API responses; each rendered without a JavaScript page error. Guard checks
also exercised unauthenticated, wrong-role, and setup-required redirects. These checks establish
route and empty-state coverage, not full behavioral equivalence.

The sweep found and fixed two initial-render crashes: Head monitoring detail read session/event
arrays before its API calls completed, and Head announcements referenced `activeId` before its
declaration. Regression tests cover both page loading states. The automated suite now has ten
passing tests for CSV behavior, route/legacy-map coverage, auth/setup guards, those regressions,
and Admin user-dialog styling; the production build also passes.

Visual comparison has only been done for the public landing page at mobile (390×844) and the Mentor
dashboard at mobile (390×844) and desktop (1440×1000), using empty API responses. Their visible
content and measured layout matched. Visual parity for the other routes is not established.
Authenticated workflows against a live API, non-empty fixture coverage for forms/tables/dialogs,
downloads/printing, historical mentee/report/chart behavior, and the remaining desktop/mobile
comparisons still need verification. No approved test account or representative data fixture was
available, so authenticated live workflows and live-data mutations were not run. Keep the Head,
Admin, and Deploy phases incomplete; do not treat the React rewrite as fully equivalent until
those checks are performed and any discrepancies fixed.

### Current parity work

- Head pages include dashboard performance/alerts, monitoring filters and history with export
  and print, monitoring-detail tabs and proof actions, announcement formatting and attachments,
  evaluation submission/proof views, account system information, password verification, and
  signature upload/consent. Remaining differences include the monitoring-detail session layout
  and unverified behavior against the live API.
- Mentee dashboard announcement and evaluation links now open the correct announcements tab,
  scroll to and highlight the target card, and clear the `id` query parameter after success.
- Admin pages include User Management CSV import with preview/validation, CSV export, pagination,
  bulk status actions, per-account and bulk permanent deletion with confirmation, and user details;
  dashboard performance/alerts; monitoring detail with
  checkpoint attendance, filters, proof browsing, logsheet/mentor-notes/non-attendance previews
  and print/export; profile signature consent; editable announcement comments; and calendar
  day filtering, generated sheet preview/publish, and CSV export with Venue/Note fields.
- Fixed the Admin User Management dialogs using `modal-overlay open` while the original stylesheet
  only displays `modal-overlay active`. The add-user dialog renders with visible computed styles
  and a non-zero card size at both 1440×1000 and 390×844. A regression test checks all four
  user-management dialog instances use the stylesheet's active class. This verifies visibility,
  not the full create/edit/import/detail API workflows.
- Fixed Admin User Management's table wrappers using `table-responsive` instead of the legacy
  stylesheet's `table-wrapper`. At 390px the data table now scrolls inside its wrapper and the
  document itself no longer overflows horizontally. A regression test covers the users,
  assignments, sections, and import-preview tables.
- Head dashboard recent activity is newest-first with per-user persisted viewed state. Evaluation
  forms now match pinned/date sorting, deadline status badges, and expandable long descriptions.
  Head account falls back to the signed-in session profile if the user-detail request fails and
  surfaces a warning.
- Exact parity for historical mentee records, chart/report behavior and output, monitoring-detail
  session layout, and some advanced content workflows remains unverified.
- Validation includes a successful production build; ten passing automated tests; empty-response
  browser smoke coverage of all 46 React routes; guard checks; API-error-state checks for Head
  monitoring detail and announcements; and desktop/mobile comparisons for the landing page and
  Mentor dashboard. These checks do not cover every workflow or route visually. CSV download and
  printing have not been confirmed end-to-end, and no authenticated live API workflows have been
  verified. Do not treat the current migration as functionally equivalent until those remaining
  checks are completed and discrepancies resolved.
- The React and Vite project directories are untracked, while the canonical source tree is tracked.
  The Vite reference has no runtime imports, but `tools/gen-page-meta.py` still reads it. Removing
  that reference requires removing/adapting the one-off generator first. Deleting the canonical
  source tree would remove 557 tracked files and needs explicit confirmation. Preserve local
  `.env`, `dist/`, and `node_modules/` during cleanup.

## Known differences from the original (deliberate)

- **Reply to a comment from someone with an apostrophe in their name** (e.g. O'Santos): the original's
  inline handler threw a syntax error, so Reply did nothing. It works in the React app. The same
  applies to **deleting a mentor announcement whose title has an apostrophe**.
- **Removing an attachment in the mentor's Post/Edit Announcement dialog**: the original's "×"
  buttons sat inside the form without `type="button"`, so each click also submitted the form and
  opened the "Post/Update Announcement?" confirmation behind the remove dialog. In React the "×"
  only removes the attachment.
- **Landing/login dark mode**: kept exactly as the original actually behaved (inverted portal-style
  dark mode); its hand-tuned landing/login palettes never applied because those pages rewrote the
  URL to "/" before theme.js ran.
- **URLs**: clean routes (`/login`, `/mentee/dashboard`, …); old `.html` links redirect.
- **Loading skeleton** is taken out of rendering once faded (idle-CPU fix carried over from the
  optimized Vite app).
- **No scroll jump after list updates**: the original rebuilt a whole list (e.g. the mentee's
  announcements after Undo on an evaluation), which briefly collapsed the "See more" bodies and let
  the browser's scroll anchoring move the page ~30px. React updates only the changed card, so the
  page stays put. Content is identical.
- **Rich text from calendar events and notes** (descriptions, a mentor's note text) is sanitized
  before display, like announcements already were; the original inserted it as raw HTML. Plain
  and formatted text display the same.
