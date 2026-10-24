import { getSession } from './session.js';

// Sidebar announcement badge (window.AnnouncementBadge in apiClient.js). The badge element itself is
// rendered by the Sidebar component, which subscribes via `subscribe`.
const badgeKey = userId => `ann_sidebar_badge_${userId}`;
const lastReadKey = userId => `ann_sidebar_lastRead_${userId}`;

const subscribers = new Set();
let current = 0;
export function subscribe(fn) { subscribers.add(fn); fn(current); return () => subscribers.delete(fn); }

export function update(count, userId) {
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

    current = safeCount;
    subscribers.forEach(fn => fn(safeCount));
}

export async function refresh(userId, getFreshCount, onAnnouncementsPage) {
    if (!userId) return;

    if (onAnnouncementsPage) {
        const now = new Date();
        const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
        try { localStorage.setItem(lastReadKey(userId), localNow); } catch (e) {}
        update(0, userId);
        return;
    }

    let lastRead = null;
    let cached = 0;
    try {
        lastRead = localStorage.getItem(lastReadKey(userId));
        cached = parseInt(localStorage.getItem(badgeKey(userId)) || '0', 10);
    } catch (e) {}
    update(cached, userId);

    if (typeof getFreshCount !== 'function') return;
    try {
        const freshCount = await getFreshCount(lastRead);
        if (freshCount !== null && freshCount !== undefined && Number.isFinite(Number(freshCount))) {
            update(freshCount, userId);
        }
    } catch (e) {}
}
