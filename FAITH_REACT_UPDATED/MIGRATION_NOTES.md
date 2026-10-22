# Migration notes — FAITH_mentoring_system-main → Vite + React

**Status: complete.** The public pages and all four portals (Head Admin, Admin, Mentor, Mentee) are ported and verified against
the vanilla app. Pages ported: **46 / 46**. The full checklist lives in [INVENTORY.md](INVENTORY.md).

## Run it

```bash
cd FAITH_REACT_UPDATED
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # serve dist/ locally
```

`.env` (see `.env.example`):

```
VITE_API_BASE_URL=http://localhost:5076/api
```

The static-file host (proof photos, signatures, attachments) is derived from it by dropping the trailing `/api`. If the
variable is unset the app falls back to the vanilla rule (HTTPS → EC2 backend, otherwise `http://<hostname>:5076/api`).

## Manual steps you need to do

1. **CORS** — the vanilla app ran on Live Server (5501), and the backend only allows 5500/5501
   (`AstraMentoring-Backend/AstraMentoringAPI/appsettings.json` → `Cors:AllowedOrigins`). Add the Vite dev origin(s):
   ```json
   "AllowedOrigins": [
     "http://localhost:5173", "http://127.0.0.1:5173",
     "http://localhost:5501", "http://127.0.0.1:5501",
     "http://localhost:5500", "http://127.0.0.1:5500"
   ]
   ```
   Do the same for the deployed origin when you host the build. (I did not touch the backend.)
2. **Email links** — the backend builds links like `{Frontend:BaseUrl}/MENTEE/HTML/announcements.html?id=…`
   (`EmailService.cs`). They keep working: every old `/<PORTAL>/HTML/<page>.html?query` URL redirects to the new route with
   the query string preserved. Set `Frontend:BaseUrl` to the new site's origin (e.g. `http://localhost:5173`) when you switch over.
3. **SPA hosting** — a static host must serve `index.html` for unknown paths (Vite dev/preview already do). For Nginx:
   `try_files $uri /index.html;`.
4. **No new npm libraries were added (React, React DOM, React Router, Vite only — the same
   versions the reference project uses). Chart.js, qrcode, html5-qrcode stay as the vendored files from the vanilla app
   (loaded on demand from `public/`); Lenis (landing smooth-scroll) still loads from the same jsDelivr CDN URL.

## Vanilla page → React route

| Vanilla page | React route | State |
|---|---|---|
| `LANDING/HTML/landing.html` | `/landing` | ported |
| `LANDING/HTML/privacy.html` | `/privacy` | ported |
| `LANDING/HTML/terms.html` | `/terms` | ported |
| `LOGIN/HTML/login.html` | `/login` | ported |
| `HEAD/HTML/head-dashboard.html` | `/head/dashboard` | ported |
| `HEAD/HTML/mentor-performance.html` | `/head/monitoring` | ported |
| `HEAD/HTML/mentor-detail.html` | `/head/monitoring/detail` | ported |
| `HEAD/HTML/attendance-summary.html` | `/head/attendance` | ported |
| `HEAD/HTML/attendance-detail.html` | `/head/attendance/detail` | ported |
| `HEAD/HTML/proof-tracking.html` | `/head/proofs` | ported |
| `HEAD/HTML/evaluation-ratings.html` | `/head/report` | ported |
| `HEAD/HTML/announcements.html` | `/head/announcements` | ported |
| `HEAD/HTML/calendar.html` | `/head/calendar` | ported |
| `HEAD/HTML/evaluation-forms.html` | `/head/evaluations` | ported |
| `HEAD/HTML/account.html` | `/head/account` | ported |
| `HEAD/HTML/setup.html` | `/head/setup` | ported |
| `ADMIN_/HTML/dashboard.html` | `/admin/dashboard` | ported |
| `ADMIN_/HTML/user-management.html` | `/admin/users` | ported |
| `ADMIN_/HTML/attendance-logs.html` | `/admin/attendance` | ported |
| `ADMIN_/HTML/attendance-detail.html` | `/admin/attendance/detail` | ported |
| `ADMIN_/HTML/sessions.html` | `/admin/monitoring` | ported |
| `ADMIN_/HTML/sessions-detail.html` | `/admin/monitoring/detail` | ported |
| `ADMIN_/HTML/session-proofs.html` | `/admin/proofs` | ported |
| `ADMIN_/HTML/evaluation-ratings.html` | `/admin/report` | ported |
| `ADMIN_/HTML/announcements.html` | `/admin/announcements` | ported |
| `ADMIN_/HTML/calendar-events.html` | `/admin/calendar` | ported |
| `ADMIN_/HTML/evaluation-forms.html` | `/admin/evaluations` | ported |
| `ADMIN_/HTML/profile.html` | `/admin/profile` | ported |
| `ADMIN_/HTML/settings.html` | `/admin/settings` | ported |
| `ADMIN_/HTML/setup.html` | `/admin/setup` | ported |
| `MENTOR/HTML/mentor-dashboard.html` | `/mentor/dashboard` | ported |
| `MENTOR/HTML/my-mentees.html` | `/mentor/mentees` | ported |
| `MENTOR/HTML/my-activities.html` | `/mentor/attendance` | ported |
| `MENTOR/HTML/sessions.html` | `/mentor/sessions` | ported |
| `MENTOR/HTML/availability.html` | `/mentor/availability` | ported |
| `MENTOR/HTML/logsheet.html` | `/mentor/logsheet` | ported |
| `MENTOR/HTML/announcements.html` | `/mentor/announcements` | ported |
| `MENTOR/HTML/calendar.html` | `/mentor/calendar` | ported |
| `MENTOR/HTML/profile.html` | `/mentor/profile` | ported |
| `MENTOR/HTML/setup.html` | `/mentor/setup` | ported |
| `MENTEE/HTML/mentee-dashboard.html` | `/mentee/dashboard` | ported |
| `MENTEE/HTML/schedule-session.html` | `/mentee/schedule` | ported |
| `MENTEE/HTML/sessions.html` | `/mentee/sessions` | ported |
| `MENTEE/HTML/announcements.html` | `/mentee/announcements` | ported |
| `MENTEE/HTML/profile.html` | `/mentee/profile` | ported |
| `MENTEE/HTML/setup.html` | `/mentee/setup` | ported |

Detail pages keep their query strings (`?id=`, `?school=`, `?status=` …), so the page logic that reads them is unchanged.
Role-protected routes: `/head/*`, `/admin/*`, `/mentor/*`, `/mentee/*` are wrapped in `RequirePortal` (login → role check → pending-setup redirect,
Mentor/Mentee logging out when setup is still pending — exactly the combination of `requireAuth()` and each sidebar script's guard).

## Structure

```
src/
  main.jsx                 router + global hosts (toasts/confirm, loading bar, maintenance screen)
  app/                     router, guards, <Page> (title/body class/per-page stylesheets), portal layout, sidebar,
                           global behaviours (scroll containment, modal scroll lock, tooltips, smooth scroll, confirm restyle)
  lib/                     api.js (fetch wrapper), session.js, config.js, pure logic modules ported 1:1 from the vanilla root scripts
  components/              Select, DateInput, Overlay, Empty, Notify, PasswordMeter, ProfileEditModal, announcements/*, …
  pages/{public,head,admin,mentor,mentee,shared}   one component per vanilla page; screens shared by several roles live in shared/
  app/Tour.jsx + app/tour.js   the Mentee portal walkthrough (walkthrough.js): engine + what the pages read while it runs
public/                    CSS (verbatim), images, fonts, vendored libs, theme.js, page-css/ (inline <style> blocks)
```

`src/app/pageMeta.js` is **generated from the vanilla HTML**: each page's `<title>`, `<body class>`, its stylesheets *in their
original order* (inline `<style>` blocks extracted to `public/page-css/`), and which shared UI scripts it loaded
(themed select / date / time pickers, modal motion, empty states). `<Page>` applies exactly that, so portals that reuse class
names with different rules (`.page-header` is styled in 26 files) still render with the right cascade.

## What could not be ported 1:1, and why

1. **`/LANDING/HTML/*.html` and `/LOGIN/HTML/login.html` URL rewrite.** The vanilla landing/login pages did
   `history.replaceState(null,"","/")` before `theme.js` ran, so their hand-tuned dark palettes (`isLanding`/`isLogin` branches) never
   applied; those pages always got the portal "invert" dark mode. `public/theme.js` keeps the same behaviour (branches pinned off, commented).
2. **Head → Mentor Detail → Non-Attendance tab.** In the vanilla script `renderNonAttendanceTabModal` reads `submittedDate`, a local
   variable of a different function, so opening that tab throws a `ReferenceError` and renders nothing. The React page renders the tab
   using the session's submitted date (what the code clearly intended, and what the print form already does).
3. **Event/announcement text is escaped.** The Head calendar interpolated event title/description/venue into `innerHTML`;
   React renders them as text (so markup typed into an event shows literally instead of rendering). Everything that the vanilla
   app deliberately sanitised (announcement/comment bodies, `sanitizeHtml`) is still rendered as sanitised HTML.
4. **Full page loads → client-side routing.** Navigation, post-login redirect and the sidebar use the router (the sidebar still
   glides its highlight and shows the skeleton for ~340 ms first). Logout, a 401 and the maintenance "log out" still do a hard
   page load, as before, so no in-memory state survives them.
5. **Back-button guard.** Vanilla pages ran `history.pushState` + a `popstate` handler so Back never left a signed-in page.
   `useBackGuard()` does the same (and copies the router's history state onto the extra entry); it is applied only to the pages that had it.
6. **Always-in-DOM modals are mounted on open.** Vanilla kept every modal in the page and toggled a class/`display`. `<Overlay>` renders the
   same classes while open and, on pages that loaded `modal-motion.js`, plays the same ~210 ms exit animation. Forms inside modals
   therefore start fresh each time they open (the vanilla open-functions reset them anyway).
7. **One quirk preserved on purpose:** the Head profile's save button reads "Yes, Save" after the first save attempt (the vanilla
   `finally` block sets that text); the proof-gallery "Download" link stays hidden after a gallery was opened.
8. **`sw.js`** is not registered by any vanilla page, so it was not ported (no service worker is installed, same as before).
9. **`ERD DATABASE/`, `SQL/`, `tests/`, `AstraMentoring-Backend/`, `deployment/`** are not frontend and were not copied.
10. **Print / logsheet windows are still string-built HTML.** The logsheet, attendance and report print forms open a pop-up window and
    write a full HTML document into it, as before (`lib/logsheetForms.js`, `lib/print-logsheet-styles.js`); they were not turned into React.
11. **Mentee walkthrough moves between pages with the router, not a page load.** The tour keeps its progress in `sessionStorage` as before
    and still reloads the page when it ends (to bring the real data back). While it runs each page shows the same sample data, supplied
    through `useTour()` instead of the vanilla script overwriting the page's DOM (which would fight React). Replay from Profile, the
    first-run auto-start after the signature step, Esc / arrow keys and the mobile sidebar drawer behave the same.
12. **A themed time picker (`components/TimeInput.jsx`)** is the React form of `ui-dropdown.js`/`time-picker` used on the availability and
    session forms; it is only used on the pages that loaded that picker.
13. **`showToast(message, type, ms, title)`** gained an optional fourth `title` argument (the Admin user-management status toasts show a bold heading above the
    message, as the vanilla notify.js variant did); calls without it are unchanged.
14. **Names, titles and notes are escaped by React** in places where the vanilla page built `innerHTML` from API text without escaping
    (e.g. the Mentee dashboard's mentor name/e-mail/tags, session topics in the details modal). Announcement and comment bodies are still
    rendered as sanitised HTML, as before.
15. **A mentor-post deep link (`announcements.html?id=<mentor post>`) behaves like vanilla**: the page switches to the mentor tab but, because
    the card is not on screen yet, does not scroll to it and leaves `?id=` in the URL.

## How it was verified (and what was not)

* `npm install` and `npm run build` run clean (no errors, no warnings).
* A headless-Edge harness loads every ported route against a **mock API** (the real backend/SQL Server was not available), records console
  errors/exceptions, and compares full-page screenshots with the vanilla pages served from the original folder against the same mock.
  Every ported page differs by ≤ 0.3 % of pixels (animation frames, sub-pixel text); `document.body.innerText` lengths match.
  The Mentee walkthrough was compared step by step on every page (identical frames) and walked end to end across all 17 steps.
* Admin / Mentor / Mentee interactions exercised too: user-management tabs, import/export and modals, settings cards, mentor availability and
  session QR scan/save flows, logsheet guided upload, mentee schedule request, session details + QR modal (a real QR is drawn, same as vanilla),
  evaluation proof upload/undo, comment edit/delete, deep links, profile edit and signature modals.
* Interactions exercised: announcement create modal + comments + kebab menus, report tab switch + chart, proof sessions modal + lightbox,
  mentor detail logsheet viewer (all three tabs), account edit modal, calendar day/month, evaluation submissions modal, attendance history,
  monitoring school filter/search, themed dropdowns.
* **Not verified:** anything that needs the live backend (real login/OTP, uploads, e-mail codes), printing/pop-up windows, the camera features (the
  mentor's QR scanner and webcam proof capture need a real camera), and mobile/touch layouts beyond what the shared CSS already does.
