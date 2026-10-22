import { emit } from './events.js';
import { getSession } from './session.js';

// Sidebar "new announcements" count, cached per user so it paints immediately on the next page.
const badgeKey = userId => `ann_sidebar_badge_${userId}`;
const lastReadKey = userId => `ann_sidebar_lastRead_${userId}`;

export function updateAnnBadge(count, userId) {
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const session = getSession();
    resolvedUserId = session?.user?.userID || session?.user?.UserID;
  }
  const parsedCount = Number(count);
  const safeCount = Number.isFinite(parsedCount) ? Math.max(0, Math.floor(parsedCount)) : 0;
  try {
    if (resolvedUserId) localStorage.setItem(badgeKey(resolvedUserId), String(safeCount));
  } catch (e) {}
  emit('annBadge', safeCount);
}

// On the Announcements page itself everything counts as read; elsewhere show the cached count,
// then the fresh one from `getFreshCount(lastRead)`.
export async function refreshAnnBadge(userId, getFreshCount, onAnnouncementsPage) {
  if (!userId) return;
  if (onAnnouncementsPage) {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
    try { localStorage.setItem(lastReadKey(userId), localNow); } catch (e) {}
    updateAnnBadge(0, userId);
    return;
  }
  let lastRead = null;
  let cached = 0;
  try {
    lastRead = localStorage.getItem(lastReadKey(userId));
    cached = parseInt(localStorage.getItem(badgeKey(userId)) || '0', 10);
  } catch (e) {}
  updateAnnBadge(cached, userId);
  try {
    const freshCount = await getFreshCount(lastRead);
    if (freshCount !== null && freshCount !== undefined && Number.isFinite(Number(freshCount))) {
      updateAnnBadge(freshCount, userId);
    }
  } catch (e) {}
}
