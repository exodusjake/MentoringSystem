// Verbatim from the original empty-states.js.
export const EMPTY_STATE_CSS = ".es-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;text-align:center;animation:es-in .35s ease both}.es-icon{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:6px;background:rgba(100,116,139,.10);color:#64748b;box-shadow:0 0 0 8px rgba(100,116,139,.05)}.es-wrap--alert .es-icon{background:rgba(220,38,38,.09);color:#dc2626;box-shadow:0 0 0 8px rgba(220,38,38,.05)}.es-title{font-size:15px;font-weight:600;color:#4b5563;line-height:1.4}.es-hint{font-size:13px;color:#9ca3af;line-height:1.5;max-width:340px}.es-body{font-size:13px;color:#9ca3af;line-height:1.5;max-width:340px}.es-body>*{max-width:100%}.es-wrap--compact .es-icon{width:40px;height:40px;box-shadow:none}.es-wrap--compact .es-icon svg{width:20px;height:20px}.es-wrap--compact .es-title{font-size:13px}@keyframes es-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.es-wrap{animation:none}}";
export const EMPTY_STATE_ICON_PATHS = {
  "inbox": "<path d=\"M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13\"/><path d=\"M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-4.5a2.5 2.5 0 0 1-5 0H4z\"/>",
  "megaphone": "<path d=\"M18 8a3 3 0 0 1 0 6\"/><path d=\"M10 8v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5\"/><path d=\"M12 8h4l4-3v14l-4-3h-4a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z\"/>",
  "calendar": "<rect x=\"4\" y=\"5\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M4 11h16\"/><path d=\"M9 16l2 2 4-4\"/>",
  "users": "<circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2\"/><path d=\"M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9\"/>",
  "clipboard": "<path d=\"M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2\"/><rect x=\"9\" y=\"3\" width=\"6\" height=\"4\" rx=\"2\"/><path d=\"M9 12h6M9 16h4\"/>",
  "chat": "<path d=\"M4 5h16v11H9l-5 4z\"/><path d=\"M8 10h8\"/>",
  "pen": "<path d=\"M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>",
  "photo": "<rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.5\"/><path d=\"M4 16l4-4 4 4 3-3 5 5\"/>",
  "alert": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v5M12 16.5v.01\"/>"
};
