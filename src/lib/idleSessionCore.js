// UX inactivity timeout; does not replace server-side authorization/club leases.
export const IDLE_LIMIT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 2 * 60 * 1000;

export function createIdleClock({ identity, storage, now = Date.now, limitMs = IDLE_LIMIT_MS, warningMs = IDLE_WARNING_MS }) {
  if (!identity || limitMs <= warningMs || warningMs <= 0) throw new Error("Ungültige Sitzungsfrist");
  const prefix = `rtliga-idle-v1:${identity}`;
  const activityKey = `${prefix}:activity`;
  const endedKey = `${prefix}:ended`;
  let lastActivity = now();
  let ended = false;
  let storageFailed = false;
  try {
    const stored = storage.getItem(activityKey);
    if (stored === null) storage.setItem(activityKey, String(lastActivity));
    else {
      const parsed = Number(stored);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > now() + 5000) ended = true;
      else lastActivity = parsed;
    }
  } catch { storageFailed = true; ended = true; }
  const expire = (reason = "idle") => {
    ended = true;
    // Separate monotone tombstone: activity from a racing tab cannot clear it.
    try { storage.setItem(endedKey, reason); } catch { storageFailed = true; }
  };
  const tick = () => {
    try {
      if (storage.getItem(endedKey)) ended = true;
      const stored = Number(storage.getItem(activityKey));
      if (Number.isFinite(stored) && stored > 0 && stored <= now() + 5000) lastActivity = Math.max(lastActivity, stored);
      else { ended = true; }
    } catch { storageFailed = true; ended = true; }
    const remainingMs = Math.max(0, Math.min(limitMs, lastActivity + limitMs - now()));
    if (ended || remainingMs === 0) {
      expire(storageFailed ? "storage" : "idle");
      return { phase: "expired", remainingMs: 0, storageFailed };
    }
    return { phase: remainingMs <= warningMs ? "warning" : "active", remainingMs, storageFailed: false };
  };
  return {
    tick, expire,
    activity({ explicit = false } = {}) {
      const state = tick();
      if (state.phase === "expired" || (state.phase === "warning" && !explicit)) return state;
      lastActivity = now();
      try { storage.setItem(activityKey, String(lastActivity)); } catch { storageFailed = true; ended = true; }
      return tick();
    },
  };
}

export function isIdleActivity(event, visible = true) {
  return visible && event.isTrusted === true &&
    ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "input"].includes(event.type);
}

export function formatIdleCountdown(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Never sign out a different/newer identity, and never use global signOut.
export async function logoutMatchingSession(client, api, club, identity, identify) {
  const getMatching = async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error("Anmeldung konnte nicht geprüft werden.");
    return { session: data?.session, matches: identity === identify(data?.session) };
  };
  const current = await getMatching();
  if (!identity || !current.matches) return { changed: Boolean(current.session) };
  if (club?.id && club.identity === identity) {
    try { await api.request("release", club.id); } catch { /* Auth revocation is still attempted. */ }
  }
  const latest = await getMatching();
  if (!latest.matches) return { changed: Boolean(latest.session) };
  const result = await client.auth.signOut({ scope: "local" });
  if (result.error) throw new Error("Abmelden konnte nicht bestätigt werden. Bitte Verbindung prüfen.");
  const after = await getMatching();
  if (after.matches) throw new Error("Die Anmeldung ist weiterhin vorhanden. Bitte erneut versuchen.");
  return { changed: Boolean(after.session) };
}
