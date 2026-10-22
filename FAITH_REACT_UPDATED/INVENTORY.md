# Vanilla → React inventory (parity checklist)

Generated from `FAITH_mentoring_system-main` (read-only source). `[x]` = ported to React and smoke-tested; `[ ]` = not yet ported.

## 1. Pages (one route per HTML page)

### Public — Landing
- [x] `LANDING/HTML/landing.html` → `/landing`
- [x] `LANDING/HTML/privacy.html` → `/privacy`
- [x] `LANDING/HTML/terms.html` → `/terms`

### Public — Login
- [x] `LOGIN/HTML/login.html` → `/login`

### Head Admin
- [x] `HEAD/HTML/account.html` → `/head/account`
- [x] `HEAD/HTML/announcements.html` → `/head/announcements`
- [x] `HEAD/HTML/attendance-detail.html` → `/head/attendance/detail`
- [x] `HEAD/HTML/attendance-summary.html` → `/head/attendance`
- [x] `HEAD/HTML/calendar.html` → `/head/calendar`
- [x] `HEAD/HTML/evaluation-forms.html` → `/head/evaluations`
- [x] `HEAD/HTML/evaluation-ratings.html` → `/head/report`
- [x] `HEAD/HTML/head-dashboard.html` → `/head/dashboard`
- [x] `HEAD/HTML/mentor-detail.html` → `/head/monitoring/detail`
- [x] `HEAD/HTML/mentor-performance.html` → `/head/monitoring`
- [x] `HEAD/HTML/proof-tracking.html` → `/head/proofs`
- [x] `HEAD/HTML/setup.html` → `/head/setup`
- [x] `HEAD/HTML/sidebar.html` — sidebar partial → `src/app/Sidebar.jsx` + `portals.js`

### Admin
- [x] `ADMIN_/HTML/announcements.html` → `/admin/announcements`
- [x] `ADMIN_/HTML/attendance-detail.html` → `/admin/attendance/detail`
- [x] `ADMIN_/HTML/attendance-logs.html` → `/admin/attendance`
- [x] `ADMIN_/HTML/calendar-events.html` → `/admin/calendar`
- [x] `ADMIN_/HTML/dashboard.html` → `/admin/dashboard`
- [x] `ADMIN_/HTML/evaluation-forms.html` → `/admin/evaluations`
- [x] `ADMIN_/HTML/evaluation-ratings.html` → `/admin/report`
- [x] `ADMIN_/HTML/profile.html` → `/admin/profile`
- [x] `ADMIN_/HTML/session-proofs.html` → `/admin/proofs`
- [x] `ADMIN_/HTML/sessions-detail.html` → `/admin/monitoring/detail`
- [x] `ADMIN_/HTML/sessions.html` → `/admin/monitoring`
- [x] `ADMIN_/HTML/settings.html` → `/admin/settings`
- [x] `ADMIN_/HTML/setup.html` → `/admin/setup`
- [x] `ADMIN_/HTML/sidebar.html` — sidebar partial → `src/app/Sidebar.jsx` + `portals.js`
- [x] `ADMIN_/HTML/user-management.html` → `/admin/users`

### Mentor
- [x] `MENTOR/HTML/announcements.html` → `/mentor/announcements`
- [x] `MENTOR/HTML/availability.html` → `/mentor/availability`
- [x] `MENTOR/HTML/calendar.html` → `/mentor/calendar`
- [x] `MENTOR/HTML/logsheet.html` → `/mentor/logsheet`
- [x] `MENTOR/HTML/mentor-dashboard.html` → `/mentor/dashboard`
- [x] `MENTOR/HTML/mentor-sidebar.html` — sidebar partial → `src/app/Sidebar.jsx` + `portals.js`
- [x] `MENTOR/HTML/my-activities.html` → `/mentor/attendance`
- [x] `MENTOR/HTML/my-mentees.html` → `/mentor/mentees`
- [x] `MENTOR/HTML/profile.html` → `/mentor/profile`
- [x] `MENTOR/HTML/sessions.html` → `/mentor/sessions`
- [x] `MENTOR/HTML/setup.html` → `/mentor/setup`

### Mentee
- [x] `MENTEE/HTML/announcements.html` → `/mentee/announcements`
- [x] `MENTEE/HTML/mentee-dashboard.html` → `/mentee/dashboard`
- [x] `MENTEE/HTML/mentee-sidebar.html` — sidebar partial → `src/app/Sidebar.jsx` + `portals.js`
- [x] `MENTEE/HTML/profile.html` → `/mentee/profile`
- [x] `MENTEE/HTML/schedule-session.html` → `/mentee/schedule`
- [x] `MENTEE/HTML/sessions.html` → `/mentee/sessions`
- [x] `MENTEE/HTML/setup.html` → `/mentee/setup`

**Pages ported: 46 / 46**

## 2. JavaScript files

### Public — Landing
- [x] `LANDING/JS/effects.js` — page logic for `/landing`, `/privacy`, `/terms`, `/login`; 0 API call(s)
- [x] `LANDING/JS/smooth-scroll.js` — page logic for `/landing`, `/privacy`, `/terms`; 0 API call(s)

### Public — Login
- [x] `LOGIN/JS/contact.js` — page logic for `/login`; 0 API call(s)
- [x] `LOGIN/JS/fit-screen.js` — page logic for `/login`; 0 API call(s)
- [x] `LOGIN/JS/login.js` — page logic for `/login`; 3 API call(s)

### Head Admin
- [x] `HEAD/JS/account.js` — page logic for `/head/account`; 8 API call(s)
- [x] `HEAD/JS/announcements.js` — page logic for `/head/announcements`; 13 API call(s)
- [x] `HEAD/JS/attendance-detail.js` — page logic for `/head/attendance/detail`; 2 API call(s)
- [x] `HEAD/JS/attendance-summary.js` — page logic for `/head/attendance`; 2 API call(s)
- [x] `HEAD/JS/calendar.js` — page logic for `/head/calendar`; 1 API call(s)
- [x] `HEAD/JS/dashboard.js` — page logic for `/head/dashboard`; 4 API call(s)
- [x] `HEAD/JS/evaluation-forms.js` — page logic for `/head/evaluations`; 4 API call(s)
- [x] `HEAD/JS/evaluation-ratings.js` — page logic for `/head/report`; 2 API call(s)
- [x] `HEAD/JS/mentor-detail.js` — page logic for `/head/monitoring/detail`; 5 API call(s)
- [x] `HEAD/JS/mentor-performance.js` — page logic for `/head/monitoring`; 5 API call(s)
- [x] `HEAD/JS/proof-tracking.js` — page logic for `/head/proofs`; 1 API call(s)
- [x] `HEAD/JS/setup.js` — page logic for `/head/setup`; 1 API call(s)
- [x] `HEAD/JS/sidebar.js` — page logic for `/head/account`, `/head/announcements`, `/head/attendance/detail`, `/head/attendance`, `/head/calendar`, `/head/evaluations`, `/head/report`, `/head/dashboard`, `/head/monitoring/detail`, `/head/monitoring`, `/head/proofs`; 1 API call(s)

### Admin
- [x] `ADMIN_/JS/announcements.js` — page logic for `/admin/announcements`; 13 API call(s)
- [x] `ADMIN_/JS/attendance-detail.js` — page logic for `/admin/attendance/detail`; 2 API call(s)
- [x] `ADMIN_/JS/attendance-logs.js` — page logic for `/admin/attendance`; 2 API call(s)
- [x] `ADMIN_/JS/calendar-events.js` — page logic for `/admin/calendar`; 5 API call(s)
- [x] `ADMIN_/JS/chart.umd.min.js` — vendored library, kept as-is in `public/` and loaded on demand — page logic for `/head/report`, `/admin/dashboard`, `/admin/report`; 0 API call(s)
- [x] `ADMIN_/JS/dashboard.js` — page logic for `/admin/dashboard`; 5 API call(s)
- [x] `ADMIN_/JS/evaluation-forms.js` — page logic for `/admin/evaluations`; 10 API call(s)
- [x] `ADMIN_/JS/evaluation-ratings.js` — page logic for `/admin/report`; 4 API call(s)
- [x] `ADMIN_/JS/profile.js` — page logic for `/admin/profile`; 4 API call(s)
- [x] `ADMIN_/JS/session-proofs.js` — page logic for `/admin/proofs`; 1 API call(s)
- [x] `ADMIN_/JS/sessions-detail.js` — page logic for `/admin/monitoring/detail`; 5 API call(s)
- [x] `ADMIN_/JS/sessions.js` — page logic for `/admin/monitoring`; 4 API call(s)
- [x] `ADMIN_/JS/settings.js` — page logic for `/admin/settings`; 7 API call(s)
- [x] `ADMIN_/JS/setup.js` — page logic for `/admin/setup`; 1 API call(s)
- [x] `ADMIN_/JS/sidebar.js` — page logic for `/admin/announcements`, `/admin/attendance/detail`, `/admin/attendance`, `/admin/calendar`, `/admin/dashboard`, `/admin/evaluations`, `/admin/report`, `/admin/profile`, `/admin/proofs`, `/admin/monitoring/detail`, `/admin/monitoring`, `/admin/settings`, `/admin/users`; 2 API call(s)
- [x] `ADMIN_/JS/user-management.js` — page logic for `/admin/users`; 19 API call(s)

### Mentor
- [x] `MENTOR/JS/announcements.js` — page logic for `/mentor/announcements`; 15 API call(s)
- [x] `MENTOR/JS/availability.js` — page logic for `/mentor/availability`; 5 API call(s)
- [x] `MENTOR/JS/calendar.js` — page logic for `/mentor/calendar`; 7 API call(s)
- [x] `MENTOR/JS/html5-qrcode.min.js` — vendored library, kept as-is in `public/` and loaded on demand — page logic for `/mentor/sessions`; 0 API call(s)
- [x] `MENTOR/JS/logsheet.js` — page logic for `/mentor/logsheet`; 7 API call(s)
- [x] `MENTOR/JS/mentor-dashboard.js` — page logic for `/mentor/dashboard`; 6 API call(s)
- [x] `MENTOR/JS/mentor-sidebar.js` — page logic for `/mentor/announcements`, `/mentor/availability`, `/mentor/calendar`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/attendance`, `/mentor/mentees`, `/mentor/profile`, `/mentor/sessions`; 3 API call(s)
- [x] `MENTOR/JS/my-activities.js` — page logic for `/mentor/attendance`; 1 API call(s)
- [x] `MENTOR/JS/my-mentees.js` — page logic for `/mentor/mentees`; 4 API call(s)
- [x] `MENTOR/JS/profile.js` — page logic for `/mentor/profile`; 5 API call(s)
- [x] `MENTOR/JS/sessions.js` — page logic for `/mentor/sessions`; 15 API call(s)
- [x] `MENTOR/JS/setup.js` — page logic for `/mentor/setup`; 1 API call(s)

### Mentee
- [x] `MENTEE/JS/announcements.js` — page logic for `/mentee/announcements`; 15 API call(s)
- [x] `MENTEE/JS/mentee-dashboard.js` — page logic for `/mentee/dashboard`; 13 API call(s)
- [x] `MENTEE/JS/mentee-sidebar.js` — page logic for `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions`; 4 API call(s)
- [x] `MENTEE/JS/profile.js` — page logic for `/mentee/profile`; 7 API call(s)
- [x] `MENTEE/JS/qrcode.min.js` — vendored library, kept as-is in `public/` and loaded on demand — page logic for `/mentee/sessions`; 0 API call(s)
- [x] `MENTEE/JS/schedule-session.js` — page logic for `/mentee/schedule`; 3 API call(s)
- [x] `MENTEE/JS/sessions.js` — page logic for `/mentee/sessions`; 8 API call(s)
- [x] `MENTEE/JS/setup.js` — page logic for `/mentee/setup`; 1 API call(s)
- [x] `MENTEE/JS/walkthrough.js` — page logic for `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions`; 0 API call(s)

### Shared root-level scripts
- [x] `apiClient.js` — fetch wrapper (token header, 401 → login, 503 → maintenance, upload validation, timeouts), session helpers, auth guard, announcement badge, logout effect, scroll containment / scroll lock / confirm-dialog restyle, loading bar, maintenance screen → `lib/api.js`, `lib/session.js`, `lib/announcementBadge.js`, `lib/logout.js`, `app/guards.jsx`, `app/globalBehaviors.js`, `components/LoadingBar.jsx`, `components/MaintenanceScreen.jsx`
- [x] `attendance-metrics.js` — attendance status/percent helpers → `lib/attendance-metrics.js`
- [x] `calendar-sheet.js` — printable academic calendar → `lib/calendar-sheet.js`
- [x] `checkpoint-window.js` — checkpoint window rules → `lib/checkpoint-window.js`
- [x] `config.js` — API/file base URL → `lib/config.js` (`VITE_API_BASE_URL`)
- [x] `dashboard-sessions.js` — session display state → `lib/dashboard-sessions.js`
- [x] `empty-states.js` — icon + title + hint empty states → `components/Empty.jsx`
- [x] `evaluation-deadline.js` — PH-time deadlines → `lib/evaluation-deadline.js`
- [x] `evaluation-description.js` — See-more measuring → `components/announcements/AnnounceContent.jsx`
- [x] `logsheet-data.js` — logsheet merge / attendance rules → `lib/logsheet-data.js`
- [x] `mentor-schools.js` — school/department/course membership → `lib/mentor-schools.js`
- [x] `mentor-section-progress.js` — per-section progress chips → `components/MentorSectionProgress.jsx`
- [x] `modal-motion.js` — modal exit animation → `components/Overlay.jsx`
- [x] `notify.js` — toast + confirm dialog → `components/Notify.jsx`
- [x] `password-strength.js` — password rule + strength meter → `lib/passwordPolicy.js`, `components/PasswordMeter.jsx`
- [x] `print-logsheet-styles.js` — print CSS → `lib/print-logsheet-styles.js`
- [x] `profile-edit.js` — Edit-profile modal (contact, password via emailed code) → `components/ProfileEditModal.jsx`
- [x] `security-utils.js` — escapeHtml / sanitizeHtml → `lib/security-utils.js`
- [x] `sidebar-indicator.js` — sliding sidebar pill, skeleton screen → `app/Sidebar.jsx`, `app/PortalLayout.jsx`
- [x] `smooth-scroll.js` — inertia wheel scrolling → `app/globalBehaviors.js`
- [x] `sw.js` — service worker (not registered by any page) → not ported (see MIGRATION_NOTES)
- [x] `theme.js` — light/dark toggle → `public/theme.js`
- [x] `tooltips.js` — help-tooltip positioning → `app/globalBehaviors.js`
- [x] `ui-datepicker.js` — themed date / datetime input → `components/DateInput.jsx`
- [x] `ui-dropdown.js` — themed `<select>` → `components/Select.jsx`
- [x] `ui-timepicker.js` — themed time input → `components/TimeInput.jsx`

## 3. CSS files (copied verbatim to `public/`, loaded per page in original `<link>` order)

- `LANDING/CSS`: `landing.css`, `motion.css`
- `LOGIN/CSS`: `login-motion.css`, `login.css`
- `HEAD/CSS`: `page-polish.css`, `setup.css`
- `ADMIN_/CSS`: `announcements.css`, `approved-page-ui.css`, `attendance-logs.css`, `calendar-events.css`, `dashboard-approved.css`, `dashboard.css`, `evaluation-forms.css`, `evaluation-ratings.css`, `monitor-activities.css`, `monitoring-mobile.css`, `page-polish.css`, `profile.css`, `session-proofs.css`, `sessions.css`, `settings.css`, `setup.css`, `sidebar.css`, `tabler-icons.min.css`, `user-management.css`
- `MENTOR/CSS`: `announcements.css`, `availability.css`, `calendar.css`, `logsheet.css`, `mentor-dashboard.css`, `mentor-sidebar.css`, `my-activities.css`, `my-mentees.css`, `profile.css`, `sessions.css`, `setup.css`
- `MENTEE/CSS`: `announcements.css`, `mentee-dashboard.css`, `mentee-sidebar.css`, `page-polish.css`, `profile.css`, `schedule-session.css`, `sessions.css`, `setup.css`
- root: `calendar-shared.css`, `evaluation-author.css`, `mentor-section-progress.css`, `profile-card.css`, `responsive.css`, `ui-buttons.css`
- Inline `<style>` blocks in 9 pages → `public/page-css/*.css`, inserted at their original position in the cascade.
- Tabler icon font → `public/ADMIN_/CSS/fonts/` (unchanged).

## 4. API endpoints (method, endpoint, pages using it)

| Method | Endpoint | Used by |
|---|---|---|
| DELETE | `AnnouncementAttachments/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| DELETE | `AnnouncementComments/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements`, `/mentee/announcements` |
| DELETE | `Announcements/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| DELETE | `AvailabilityWorkflow/mentor/${}/slots/${}` | `/mentor/availability` |
| DELETE | `CalendarEvents/${}` | `/admin/calendar` |
| DELETE | `EvaluationAttachments/${}` | `/admin/evaluations` |
| DELETE | `EvaluationLinks/${}` | `/admin/evaluations` |
| DELETE | `EvaluationRatings/${}?${}` | `/admin/report` |
| DELETE | `EvaluationSubmissions/${}` | `/mentee/announcements` |
| DELETE | `MentorSchedule/${}` | `/mentor/calendar` |
| DELETE | `Sessions/${}` | `/mentor/sessions` |
| DELETE | `Users/${}` | `/admin/users` |
| DELETE | `Users/assignments/${}` | `/admin/users` |
| GET | `Activities?top=25` | `/head/dashboard`, `/admin/dashboard` |
| GET | `AnnouncementAttachments` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements`, `/mentee/announcements` |
| GET | `AnnouncementComments/announcement/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements`, `/mentee/announcements` |
| GET | `AnnouncementComments/announcer/${}/latest` | `/head/account`, `/head/announcements`, `/head/attendance/detail`, `/head/attendance`, `/head/calendar`, `/head/evaluations`, `/head/report`, `/head/dashboard`, `/head/monitoring/detail`, `/head/monitoring`, `/head/proofs`, `/admin/announcements`, `/admin/attendance/detail`, `/admin/attendance`, `/admin/calendar`, `/admin/dashboard`, `/admin/evaluations`, `/admin/report`, `/admin/profile`, `/admin/proofs`, `/admin/monitoring/detail`, `/admin/monitoring`, `/admin/settings`, `/admin/users`, `/mentor/announcements`, `/mentor/availability`, `/mentor/calendar`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/attendance`, `/mentor/mentees`, `/mentor/profile`, `/mentor/sessions` |
| GET | `AnnouncementComments/mentioned/${}/latest` | `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions` |
| GET | `Announcements` | `/head/announcements`, `/admin/announcements`, `/admin/attendance/detail`, `/admin/attendance`, `/admin/calendar`, `/admin/dashboard`, `/admin/evaluations`, `/admin/report`, `/admin/profile`, `/admin/proofs`, `/admin/monitoring/detail`, `/admin/monitoring`, `/admin/settings`, `/admin/users`, `/mentor/announcements`, `/mentor/dashboard`, `/mentor/availability`, `/mentor/calendar`, `/mentor/logsheet`, `/mentor/attendance`, `/mentor/mentees`, `/mentor/profile`, `/mentor/sessions`, `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions` |
| GET | `AttendanceLogs` | `/head/attendance`, `/admin/attendance` |
| GET | `AttendanceLogs/${}/mentees` | `/head/attendance/detail`, `/admin/attendance/detail` |
| GET | `AttendanceLogs/full-report${}` | `/head/attendance`, `/admin/attendance` |
| GET | `AttendanceLogs/mentee/${}?mentorId=${}` | `/head/attendance/detail`, `/admin/attendance/detail` |
| GET | `AvailabilityWorkflow/mentee/${}/request-history` | `/mentee/schedule` |
| GET | `AvailabilityWorkflow/mentee/${}/slots` | `/mentee/schedule` |
| GET | `AvailabilityWorkflow/mentor/${}/slots` | `/mentor/availability`, `/mentor/calendar` |
| GET | `CalendarEvents` | `/head/calendar`, `/head/monitoring/detail`, `/admin/calendar`, `/admin/monitoring/detail`, `/mentor/availability`, `/mentor/calendar`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/sessions`, `/mentee/dashboard`, `/mentee/sessions` |
| GET | `ESignature/${}` | `/head/account`, `/admin/profile`, `/mentor/profile`, `/mentee/profile` |
| GET | `EvaluationAttachments` | `/head/evaluations`, `/admin/evaluations`, `/mentee/announcements` |
| GET | `EvaluationLinks` | `/head/evaluations`, `/admin/evaluations`, `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions` |
| GET | `EvaluationSubmissions/${}` | `/head/evaluations`, `/admin/evaluations` |
| GET | `EvaluationSubmissions/mine` | `/mentee/announcements`, `/mentee/dashboard` |
| GET | `EvaluationSubmissions/summary` | `/head/evaluations`, `/admin/evaluations` |
| GET | `MentorProfiles` | `/mentor/announcements`, `/mentor/availability`, `/mentor/calendar`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/attendance`, `/mentor/mentees`, `/mentor/profile`, `/mentor/sessions`, `/mentee/dashboard` |
| GET | `MentorSchedule?mentorId=${}` | `/mentor/calendar` |
| GET | `MonitorActivities` | `/head/dashboard`, `/head/report`, `/head/monitoring`, `/admin/dashboard`, `/admin/report`, `/admin/monitoring` |
| GET | `MonitorActivities/${}` | `/head/monitoring/detail`, `/admin/monitoring/detail`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/attendance`, `/mentee/dashboard`, `/mentee/sessions` |
| GET | `MonitorActivities/${}/reports?schoolYear=${}&semester=${}` | `logsheet-data.js` |
| GET | `MonitorActivities?${}` | `/head/monitoring`, `/admin/monitoring` |
| GET | `MonitorActivities?includeInactive=true` | `/head/monitoring` |
| GET | `Sections` | `/admin/users` |
| GET | `Sections/mentor-view` | `/admin/users` |
| GET | `SessionProofsAdmin` | `/head/proofs`, `/admin/proofs` |
| GET | `SessionsAdmin/${}/logsheet` | `/head/monitoring/detail`, `/admin/monitoring/detail`, `/mentor/logsheet` |
| GET | `SessionsAdmin/${}/sessions` | `/head/monitoring/detail`, `/admin/monitoring/detail`, `/mentor/calendar`, `/mentor/dashboard`, `/mentor/sessions`, `/mentee/dashboard`, `/mentee/sessions` |
| GET | `SessionsAdmin/session/${}/mentees` | `/mentor/sessions`, `/mentee/dashboard`, `/mentee/sessions` |
| GET | `SessionsAdmin/session/${}/requester` | `/mentor/sessions`, `/mentee/dashboard`, `/mentee/sessions` |
| GET | `Settings` | `/head/account`, `/head/dashboard`, `/head/report`, `/head/monitoring/detail`, `/head/monitoring`, `/admin/calendar`, `/admin/dashboard`, `/admin/report`, `/admin/monitoring/detail`, `/admin/monitoring`, `/admin/settings`, `/admin/users`, `/mentor/availability`, `/mentor/logsheet`, `/mentor/dashboard`, `/mentor/mentees`, `/mentor/sessions`, `/mentee/dashboard`, `/mentee/profile`, `calendar-sheet.js` |
| GET | `Settings/calendar-signatures` | `calendar-sheet.js` |
| GET | `Settings/period-history` | `/head/monitoring`, `/admin/monitoring`, `/admin/users` |
| GET | `Users` | `/admin/dashboard`, `/admin/users` |
| GET | `Users/${}` | `/head/account`, `/admin/profile`, `/mentor/mentees`, `/mentor/profile`, `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile` |
| GET | `Users/assignments` | `/admin/users`, `/mentor/announcements`, `/mentor/dashboard`, `/mentor/mentees`, `/mentor/sessions`, `/mentee/announcements`, `/mentee/dashboard`, `/mentee/profile`, `/mentee/schedule`, `/mentee/sessions`, `mentor-schools.js` |
| GET | `Users/courses` | `/mentor/sessions` |
| GET | `Users/departments` | `/admin/users` |
| GET | `Users/engagement` | `/admin/users` |
| GET | `Users/mentees-with-dept` | `/admin/users`, `/mentor/announcements`, `/mentor/mentees`, `/mentor/sessions`, `/mentee/announcements`, `/mentee/profile`, `/mentee/sessions` |
| GET | `Users/mentors-with-dept` | `/head/announcements`, `/admin/announcements`, `/admin/users`, `/mentee/announcements` |
| GET | `Users/stats` | `/head/dashboard`, `/admin/dashboard`, `/admin/users` |
| PATCH | `Announcements/${}/pin` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| PATCH | `Attendance/${}/text-fields` | `/mentor/logsheet` |
| PATCH | `EvaluationLinks/${}/pin` | `/admin/evaluations` |
| PATCH | `Sessions/${}/log-status` | `/mentor/logsheet` |
| PATCH | `Users/${}/active` | `/admin/users` |
| PATCH | `Users/${}/dropout` | `/admin/users` |
| POST | `AnnouncementAttachments/upload` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| POST | `AnnouncementComments` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements`, `/mentee/announcements` |
| POST | `Announcements` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| POST | `Attendance` | `/mentor/logsheet`, `/mentor/sessions` |
| POST | `Auth/change-password` | `/head/account`, `profile-edit.js` |
| POST | `Auth/login` | `/login` |
| POST | `Auth/password-code` | `/head/account`, `profile-edit.js` |
| POST | `Auth/password-code/verify` | `/head/account`, `profile-edit.js` |
| POST | `Auth/register` | `/admin/users` |
| POST | `Auth/resend-login-code` | `/login` |
| POST | `Auth/verify-login-code` | `/login` |
| POST | `AvailabilityWorkflow/mentee/${}/request` | `/mentee/schedule` |
| POST | `AvailabilityWorkflow/mentor/${}/slots` | `/mentor/availability` |
| POST | `CalendarEvents` | `/admin/calendar` |
| POST | `ESignature/${}` | `/head/account`, `/head/setup`, `/admin/profile`, `/admin/setup`, `/mentor/profile`, `/mentor/setup`, `/mentee/profile`, `/mentee/setup` |
| POST | `EvaluationAttachments/upload` | `/admin/evaluations` |
| POST | `EvaluationLinks` | `/admin/evaluations` |
| POST | `EvaluationSubmissions/upload` | `/mentee/announcements`, `/mentee/dashboard` |
| POST | `MentorSchedule` | `/mentor/calendar` |
| POST | `ProofOfSession/upload` | `/mentor/sessions` |
| POST | `QRAttendance/generate` | `/mentee/sessions` |
| POST | `QRAttendance/scan` | `/mentor/sessions` |
| POST | `Sections` | `/admin/users` |
| POST | `Sessions` | `/mentor/sessions` |
| POST | `Sessions/${}/finish` | `/mentor/sessions` |
| POST | `Settings/password-code` | `/admin/settings` |
| POST | `Settings/password-code/verify` | `/admin/settings` |
| POST | `Settings/verify-password` | `/admin/settings` |
| POST | `Users/assign` | `/admin/users` |
| PUT | `AnnouncementComments/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements`, `/mentee/announcements` |
| PUT | `Announcements/${}` | `/head/announcements`, `/admin/announcements`, `/mentor/announcements` |
| PUT | `CalendarEvents/${}` | `/admin/calendar` |
| PUT | `EvaluationLinks/${}` | `/admin/evaluations` |
| PUT | `EvaluationRatings/${}` | `/admin/report` |
| PUT | `MentorSchedule/${}` | `/mentor/calendar` |
| PUT | `Sessions/${}` | `/mentor/sessions` |
| PUT | `Settings/${}` | `/admin/settings` |
| PUT | `Settings/change-password` | `/admin/settings` |
| PUT | `Settings/maintenance` | `/admin/settings` |
| PUT | `Users/${}` | `/head/account`, `/admin/profile`, `/admin/users`, `/mentor/profile`, `/mentee/profile`, `profile-edit.js` |

Direct `fetch` calls (not through `apiRequest`): `Auth/forgot-password`, `Auth/verify-reset-code`, `Auth/reset-password`, `Contact` (login page), `Maintenance` (maintenance screen poll).
