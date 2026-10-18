# FAITH Mentoring System — Architecture Notes

This file exists because the same small set of non-obvious rules has
caused the same class of bug more than once. Read this before touching
session/attendance/logsheet code, auth, or the print system.

## Layout

Four portals, each a self-contained set of `HTML/`, `CSS/`, `JS/`
folders at the repo root: `HEAD/`, `ADMIN_/`, `MENTOR/`, `MENTEE/`.
Each portal duplicates its own logic rather than sharing components —
this is a known maintainability gap (see "Known gaps" below), not a
convention to extend on purpose.

Root-level shared files, loaded via `../../` relative paths from every
portal's HTML:
- `config.js`, `apiClient.js` — API base URL, `requireAuth()`,
  `getSession()`/`saveSession()`/`clearSession()`.
- `print-logsheet-styles.js` — the one piece of shared CSS-in-JS,
  covering both Admin's `.paper-*` and Mentor/Head/Mentee's
  `.form-page`/`.sig-*` printed-logsheet class families side by side.
  If you're touching printed-logsheet styling, it lives here, not in
  four separate `<style>` blocks.

Backend: `AstraMentoring-Backend/AstraMentoringAPI` (controllers,
`Program.cs`) + `AstraMentoring-Backend/AstraMentoring-Backend`
(services, models, repositories). Controllers are thin; almost all
logic lives in a matching `*Service.cs`, often with raw Dapper SQL
rather than the generic repository.

**Dead/legacy — do not extend:**
- `Mentees/` (capital, plural — distinct from `MENTEE/`) is an early
  April-2026 prototype, explicitly marked "DRAFT ONLY, NOT FINAL" in
  its own commit history. The real mentee portal is `MENTEE/`.
- `ADMIN_/HTML/monitor-activities.html` / `mentor-activities.js` were
  deleted (superseded by `sessions.html`/`sessions.js`, which merged
  the two) — don't resurrect them.
- Several backend routes are unreachable from any current frontend
  (bare `AvailabilityController`, `SessionRequestsController`,
  `ActivitiesController`, the `Approve`/`Decline` actions on
  `AvailabilityWorkflowController`) — superseded by
  `AvailabilityWorkflowController`'s `mentor/{id}/slots` routes and the
  auto-approve flow below. They're still authorized correctly, just not
  called by anything live.

## Sessions & attendance — the rule that's caused the most bugs

**`isMakeup` detection is not one convention — it's (at least) three,
and the differences are deliberate.** A naive "just extract this into
one shared function" refactor was considered and abandoned after
finding this; don't redo that work without reading this section first.

1. **Fallback** — `s.isMakeup || !/^\[.+?\]/.test(s.topic || '')`. Used
   in `MENTEE/JS/mentee-dashboard.js`, `MENTEE/JS/sessions.js`, and
   `ADMIN_/JS/sessions-detail.js`'s own `isMakeupSession(s)`. Correct
   where the caller can't fully trust the backend flag alone.
2. **Flag-only** — `s.isMakeup` (or `!!s.isMakeup`), no regex fallback
   at all. Used in `MENTOR/JS/sessions.js` and `MENTOR/JS/logsheet.js`'s
   own `isMakeupSession(session)`. **This is not an oversight** —
   `MENTOR/JS/sessions.js` has a comment explaining that the
   regex-fallback approach used to silently break for a mentor handling
   more than one section, and was deliberately replaced with the flag
   alone once `Sessions.SectionCode` became a reliably-populated real
   column.
3. **Flag-only, dual-casing** — `HEAD/JS/mentor-detail.js`'s
   `lsIsMakeup(session)` checks `session.isMakeup === true ||
   session.IsMakeup === true`. Exists specifically because the
   print-form code path it's used in receives session data from a
   different shape than the rest of the page (PascalCase vs camelCase)
   — from the same July-2026 HEAD portal audit that also fixed a related
   `lsIsMakeup` regex bug.

If you're adding a new place that needs to classify a session, don't
reach for whichever variant is nearest — decide whether the data source
you have reliably carries `isMakeup`, and pick "flag-only" if so,
"fallback" if not (or copy the relevant existing variant verbatim,
which is what's happened here so far).

**Two different mentee-roster endpoints, and when to use which:**
- `SessionsAdmin/session/{id}/mentees` — **attendance-based**. Only
  returns a mentee once something real exists in `Attendance`
  (`attendanceID > 0` = a real scanned/recorded row). Correct for a
  *completed* session's roster.
- `SessionsAdmin/session/{id}/requester` — **SessionRequests-based**.
  The only source that knows "who booked this slot" *before* any
  attendance exists — i.e. before the session has happened. Correct
  for a makeup session that's still Scheduled.

Using `/mentees` for a not-yet-completed makeup session is the bug
that recurred three times this project (Mentee Dashboard's Upcoming
Sessions, the Mentee Sessions page, and originally the Mentor's own QR
attendance setup) — the fetch silently comes back empty, so the
session is invisible everywhere that gates on it. If you're building
a new "does this mentee see this session" check, decide up front
which of the two endpoints applies, and fetch **both** in parallel
when a session list contains a mix of completed and not-yet-completed
makeup sessions.

## Auto-approve booking (no more "Pending")

`sp_SubmitSessionRequest` inserts a request as `Status = 'Approved'`
immediately and runs the same create-or-reuse-session logic
`sp_ApproveSessionRequest` already had — a request is a real `Session`
row from the moment it's submitted. There is no mentor approval step
in the UI anymore. Multiple mentees requesting the same slot share one
`Session` row (group booking), by design.

## Dynamic QR attendance

Attendance presence is QR-only. The Mentor scanner shows read-only attendance
badges; logsheet notes never imply presence, including for makeup sessions.
`POST Attendance` only ensures an absent roster row exists and returns an
existing row unchanged. Generic attendance PUT/DELETE are disabled. Notes use
text-only PATCH statements so an edit cannot overwrite a concurrent QR scan.
Existing historical records are retained; no retroactive attendance reset occurs.

`Attendance.ScannedAt` is a UTC instant (legacy SQL datetime values have no zone
suffix). `logsheet-data.js` interprets it as UTC and displays it in Asia/Manila
for Mentor, Admin, Head and print. Scheduled session/availability times are
appointments, never fallback attendance times. `POST Sessions/{id}/finish`
records the actual server finish time in Philippine wall time in `TimeEnd`;
generic session edits preserve it. QR scans after finishing are rejected.

The shared logsheet merger groups by school year, semester, checkpoint and
section, retaining each mentee's source attendance ID, scan, end and proof.
Make-up-only groups use view IDs; writes use `_sourceSessionID`. Session proof
uploads remain separate. `CheckpointLogs` holds per-section submission state,
including make-ups serving more than one section. QR attendance reopens only
the affected submitted checkpoint with `NeedsUpdate`; resubmission clears it.
Apply `SQL/logsheet_actual_attendance.sql` before deploying this API version.
`MonitorActivitiesService` uses the same per-period checkpoint/section state
for overview totals, Top 3 section progress, completeness, timeliness and mentor
details. Regular and scanned make-up rounds count once per checkpoint; a
`CheckpointLogs` row overrides legacy session submission state, including
`NeedsUpdate`. Calendar availability cards show only the scheduled start time;
Admin calendar window end dates and submission deadlines retain their meanings.
Regression checks: `node --test tests/logsheet-data.test.cjs`; the SQL workflow
test must run inside a transaction and rolls back its fixture rows.

`QRAttendanceController`: `/generate` (Mentee-only) issues a 90-second,
single-use token (`QRTokens` table); `/scan` (Mentor-only) validates,
marks `Attendance.IsPresent = 1`, and auto-completes the `Session` in
one stored procedure (`sp_ScanQRAttendance`). Both endpoints derive the
caller's identity from the JWT, never a client-supplied ID — this was
a real, fixed vulnerability (see Security below), not an incidental
design choice.

## E-signatures & first-login setup

- Mentor/Mentee signatures live on their own profile tables
  (`MentorProfiles.SignatureFilePath` / `MenteeProfiles.SignatureFilePath`).
- Admin/Head have no dedicated profile table — their signature lives
  directly on `Users.SignatureFilePath`.
- `ESignatureController`'s `GetProfileSqls(role)` branches on role to
  pick the right table; keep all three branches in sync if the schema
  ever changes.
- **First-login gate**: `AuthService.LoginAsync` computes
  `setupRequired` for all four roles (signature missing → true) and
  returns it on the login response. `requireAuth()` (in `apiClient.js`)
  re-checks this on *every* authenticated page load and redirects to
  that role's `setup.html` if still required — this is the only thing
  that makes the gate actually mandatory; the login-time redirect alone
  is bypassable (a signed-in session revisiting `login.html` used to
  skip straight to the dashboard). If you add a fifth role or a new
  gated flow, it needs to plug into both places.
- Each `setup.html`'s "Back to Login" link calls `clearSession()`
  before navigating — without it, "Back to Login" just bounces back to
  the same setup page once the gate above is enforced everywhere.

## Security pattern — apply this to any new mutating endpoint

Every controller in this codebase sits behind a global "any
authenticated user" fallback policy by default (`Program.cs`). That is
**not** the same as "only the right user" — a controller with no
`[Authorize(Roles=...)]` and no ownership check lets any signed-in
account, any role, act on any other user's data by guessing an ID.
This was found to be the actual state of about half the controllers in
this codebase and fixed across two dedicated passes. The house pattern
now used everywhere:

```csharp
private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
```
- Restrict the endpoint to the role(s) whose frontend actually calls
  it (check first — grep the portals for the endpoint's URL before
  guessing).
- Never trust a client-supplied "which user is this for" field
  (`PostedByUserID`, `UploadedByUserID`, a `{userId}`/`{mentorId}` route
  param) — always set it from `CallerId`.
- For an update/delete on an existing row, check ownership against the
  row's **already-stored** owner (fetch it, don't trust the request
  body's claimed value), or a full-column `UPDATE` can silently
  reassign ownership even when the read path is protected.
- If Admin/Head should have moderation override, check
  `User.IsInRole("Admin") || User.IsInRole("Head")` before the
  ownership check, not instead of it.

New mutating endpoint → new grep for its frontend callers → apply this
pattern before merging, not after.

## Known gaps (not yet done)

- `AstraMentoring-Backend/AstraMentoringAPI.Tests` (xUnit +
  `WebApplicationFactory`) covers the P0/P1 authorization fixes, but
  nothing else — session numbering, attendance scoping, and the
  makeup-session roster rule above are still only verified by hand
  (`curl` + direct SQL checks). Extending the suite to those is the
  next-highest-value addition; see that project's own comments for the
  pattern (real HTTP calls, real seeded accounts, restore-in-`finally`
  for anything that mutates the shared dev database).
- The four portals duplicate rather than share logic in general —
  `print-logsheet-styles.js` is still the only precedent for pulling
  shared logic into one file, and auth guards are a safe next
  candidate. **`isMakeup` detection specifically was evaluated for this
  and deliberately left alone** — see "Sessions & attendance" above;
  the three variants encode real, different correctness requirements,
  not accidental drift.
- Evaluation Forms is proof-by-screenshot, not a real integration with
  Google Forms/Sheets responses — self-reported, not verified.
