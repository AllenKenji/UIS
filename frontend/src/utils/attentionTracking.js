// Tracks, per-resident, when a tab of "My Requests" (PublicServicesAccess)
// was last opened — used to badge a tab only for status changes the
// resident hasn't seen yet (e.g. a complaint just marked "resolved"),
// rather than flagging every terminal-state record forever.
//
// Residents accessing the public portal never log in, so there's no server
// session to track "last seen" against — localStorage is scoped per
// browser/device, which is good enough for a soft "you have an update"
// nudge and never blocks anything if it's unavailable (private browsing,
// storage disabled, etc.).
const STORAGE_PREFIX = "bis:lastSeen:";

export function getLastSeen(residentId, section) {
  if (!residentId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${residentId}:${section}`);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

export function markSeen(residentId, section) {
  if (!residentId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${residentId}:${section}`, new Date().toISOString());
  } catch {
    // Storage unavailable — badge just won't clear until it works again.
  }
}
