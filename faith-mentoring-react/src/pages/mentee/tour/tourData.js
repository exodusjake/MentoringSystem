// Verbatim from the original walkthrough.js (styles, steps, icons); step pages are Mentee routes.
export const TOUR_CSS = ".wt-blur{position:fixed;inset:0;z-index:100040;background:rgba(30,27,75,.32);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;transition:opacity .35s ease,clip-path .5s cubic-bezier(.65,0,.35,1)}.wt-blur.show{opacity:1}.wt-ring{position:fixed;z-index:100041;border-radius:14px;border:2px solid #6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.22),0 0 30px rgba(79,70,229,.5);pointer-events:auto;opacity:0;transition:left .5s cubic-bezier(.65,0,.35,1),top .5s cubic-bezier(.65,0,.35,1),width .5s cubic-bezier(.65,0,.35,1),height .5s cubic-bezier(.65,0,.35,1),opacity .3s ease;animation:wtGlow 2.4s ease-in-out infinite}@keyframes wtGlow{0%,100%{box-shadow:0 0 0 4px rgba(99,102,241,.22),0 0 24px rgba(79,70,229,.40)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.14),0 0 36px rgba(79,70,229,.62)}}.wt-ring.show{opacity:1}.wt-ring.none{opacity:0!important}.wt-tip{position:fixed;z-index:100042;width:320px;max-width:calc(100vw - 24px);box-sizing:border-box;background:#fff;border:1px solid #c7d2fe;border-radius:16px;padding:16px 18px;box-shadow:0 20px 50px rgba(30,27,75,.35);font-family:\"DM Sans\",system-ui,sans-serif;opacity:0;transform:translateY(10px) scale(.97);transition:opacity .3s ease,transform .4s cubic-bezier(.22,1,.36,1),left .5s cubic-bezier(.65,0,.35,1),top .5s cubic-bezier(.65,0,.35,1)}.wt-tip.show{opacity:1;transform:none}.wt-inner{transition:opacity .18s ease,transform .22s ease}.wt-inner.swap{opacity:0;transform:translateY(6px)}.wt-track,.wt-track.wt-ring,.wt-track.wt-tip,.wt-track.wt-blur{transition:none!important}.wt-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}.wt-icon{width:34px;height:34px;border-radius:10px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}.wt-step{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wt-sample{font-size:9.5px;font-weight:700;letter-spacing:.06em;color:#92400e;background:#fef3c7;border-radius:5px;padding:2px 6px}.wt-title{font-size:18px;font-weight:700;color:#1f2937;margin:0 0 6px}.wt-text{font-size:13.5px;line-height:1.55;color:#4b5563;margin:0 0 14px}.wt-bar{height:4px;border-radius:4px;background:#e5e7eb;overflow:hidden;margin-bottom:14px}.wt-bar span{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#4f46e5);transition:width .5s cubic-bezier(.65,0,.35,1)}.wt-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.wt-skip{border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:#6b7280;text-decoration:underline;cursor:pointer;padding:6px 2px;transition:color .15s}.wt-skip:hover{color:#111827}.wt-btns{display:flex;gap:8px}.wt-btn{font:inherit;font-size:13px;font-weight:600;border-radius:20px;padding:8px 20px;cursor:pointer;border:1px solid transparent;transition:background-color .18s,transform .15s,box-shadow .18s}.wt-btn:active{transform:scale(.94)}.wt-back{background:#fff;border-color:#dce3ec;color:#374151}.wt-back:hover{background:#f4f7fb}.wt-next{background:#4f46e5;color:#fff}.wt-next:hover{background:#4338ca;box-shadow:0 4px 12px rgba(79,70,229,.35)}.wt-tip button:focus-visible{outline:2px solid #818cf8;outline-offset:2px}@media (prefers-reduced-motion:reduce){.wt-blur,.wt-ring,.wt-tip,.wt-inner,.wt-bar span{transition:none;animation:none}}";
export const STEPS = [
  {
    "page": "dashboard",
    "sel": "#nav-dashboard",
    "side": "right",
    "title": "Dashboard",
    "text": "Your home base. Here you see your mentor, your upcoming sessions and your recent sessions at a glance."
  },
  {
    "page": "dashboard",
    "sel": ".mentor-preview-card",
    "sample": true,
    "title": "My Mentor",
    "text": "Your assigned mentor for the semester: name, email, department and school, so you always know who to reach out to."
  },
  {
    "page": "dashboard",
    "all": ".sessions-card",
    "nth": 0,
    "sample": true,
    "title": "Upcoming Sessions",
    "text": "Your next booked sessions, regular or make-up, tagged Today or Overdue when needed."
  },
  {
    "page": "dashboard",
    "all": ".sessions-card",
    "nth": 1,
    "sample": true,
    "title": "Recent Sessions",
    "text": "Sessions that are already done or cancelled, with your Present or Absent mark."
  },
  {
    "page": "sessions",
    "sel": "#nav-sessions",
    "side": "right",
    "title": "Sessions",
    "text": "The full list of your mentoring sessions and your semester record."
  },
  {
    "page": "sessions",
    "sel": "#attendanceBanner",
    "sample": true,
    "title": "Record",
    "text": "Your semester record: how many checkpoints you have completed out of the required total, plus a count of completed, scheduled and cancelled sessions."
  },
  {
    "page": "sessions",
    "sel": ".btn-qr",
    "sample": true,
    "title": "Show QR",
    "text": "On the day of a session, tap Show QR and let your mentor scan it. That is how your attendance is recorded. The code refreshes every couple of minutes."
  },
  {
    "page": "sessions",
    "sel": ".btn-detail",
    "sample": true,
    "title": "Details",
    "text": "Open Details to see the date, time, topic, status and whether your attendance has been recorded."
  },
  {
    "page": "schedule",
    "sel": "#nav-schedule",
    "side": "right",
    "title": "Scheduled Sessions",
    "text": "Book your checkpoint sessions here, using time slots your mentor has opened."
  },
  {
    "page": "schedule",
    "sel": ".btn-request",
    "sample": true,
    "title": "Request This Slot",
    "text": "Found a time that works for you? Tap Request This Slot."
  },
  {
    "page": "schedule",
    "sel": "#requestModal .btn-save",
    "sample": true,
    "enter": "openModal",
    "leave": "closeModal",
    "title": "Send Request",
    "text": "Optionally add what you want to discuss, then tap Send Request. The slot is booked right away."
  },
  {
    "page": "schedule",
    "sel": ".sch-slot-card",
    "sample": true,
    "enter": "approve",
    "title": "Session Scheduled",
    "text": "The card now reads Session Scheduled, and the session appears on your Sessions page immediately."
  },
  {
    "page": "announcements",
    "sel": "#nav-announce",
    "side": "right",
    "title": "Announcements",
    "text": "News and evaluation forms from the program team and your mentor. A red badge shows when something is new."
  },
  {
    "page": "announcements",
    "sel": ".announce-card",
    "sample": true,
    "enter": "tabAdmin",
    "title": "Admin Announcement",
    "text": "The Administration tab holds official announcements and evaluation forms from the admins. Pinned posts stay on top."
  },
  {
    "page": "announcements",
    "sel": ".announce-card",
    "sample": true,
    "enter": "tabMentor",
    "title": "My Mentor Announcement",
    "text": "The From My Mentor tab shows what your own mentor posts, and you can comment on them."
  },
  {
    "page": "profile",
    "sel": "#nav-profile",
    "side": "right",
    "title": "Profile",
    "text": "View your account and academic details, update your contact number, change your password or replace your signature. You can replay this tour from here too."
  },
  {
    "page": "profile",
    "sel": ".logout-btn",
    "side": "right",
    "title": "Logout",
    "text": "When you are done, use Logout to sign out safely, especially on a shared computer."
  }
];
export const ICONS = {
  "Dashboard": "ti-layout-dashboard",
  "My Mentor": "ti-user-circle",
  "Upcoming Sessions": "ti-calendar-event",
  "Recent Sessions": "ti-history",
  "Sessions": "ti-calendar-event",
  "Record": "ti-chart-bar",
  "Show QR": "ti-qrcode",
  "Details": "ti-info-circle",
  "Scheduled Sessions": "ti-clock-plus",
  "Request This Slot": "ti-pointer",
  "Send Request": "ti-send",
  "Session Scheduled": "ti-calendar-check",
  "Announcements": "ti-speakerphone",
  "Admin Announcement": "ti-building",
  "My Mentor Announcement": "ti-speakerphone",
  "Profile": "ti-user-circle",
  "Logout": "ti-logout"
};
