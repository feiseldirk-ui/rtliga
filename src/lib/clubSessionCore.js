// Client contract only. A database-enforced lease is REQUIRED before deployment.
export const CLUB_SESSION_RPC = "rtliga_club_session_v1";
export const MAX_LEASE_MS = 10 * 60 * 1000;

export function sessionMessage(reason) {
  return ({
    busy: "Dieser Verein ist bereits auf einem anderen Gerät angemeldet. Bitte dort zuerst den Vereinsbereich verlassen. Nach einem Verbindungsabbruch wird der Zugang spätestens nach zehn Minuten freigegeben.",
    ended: "Diese Vereinssitzung ist abgelaufen oder wurde beendet. Bitte erneut anmelden. Ungespeicherte Eingaben wurden nicht automatisch gespeichert.",
    tab_busy: "Der Vereinsbereich ist bereits in einem anderen Tab dieses Browsers geöffnet. Bitte dort weiterarbeiten oder diesen Tab zuerst schließen.",
    unsupported: "Dieser Browser unterstützt die benötigte Tabsperre nicht. Bitte einen aktuellen Browser verwenden.",
    unavailable: "Die Vereinssperre ist auf dem Server noch nicht eingerichtet oder nicht kompatibel. Der Vereinsbereich bleibt zum Schutz der Daten gesperrt. Bitte die Administration verständigen.",
    account_changed: "In diesem Browser wurde die Anmeldung gewechselt. Die bisherige Vereinssitzung kann nicht weiterbearbeitet werden.",
    different_account: "In diesem Browser ist bereits ein anderes Konto angemeldet. Bitte dieses zuerst regulär verlassen oder einen anderen Browser verwenden.",
    network: "Die Vereinssitzung konnte nicht bestätigt werden. Eingaben sind vorübergehend gesperrt. Bereits eingegebene Daten bleiben in diesem geöffneten Tab erhalten. Bitte die Verbindung prüfen und erneut versuchen.",
  })[reason] || "Die Vereinssitzung konnte nicht bestätigt werden. Bitte erneut versuchen.";
}

export function sessionError(reason) {
  return Object.assign(new Error(sessionMessage(reason)), { reason });
}

// Used ONLY to notice local auth changes; authorization belongs to the server.
export function sessionIdentity(session) {
  try {
    const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload));
    if (!session.user?.id || !claims.session_id || claims.sub !== session.user.id) return null;
    return `${session.user.id}:${claims.session_id}`;
  } catch {
    return null;
  }
}

export function validateLease(data, action, clubId) {
  if (data?.api_version !== 1 || data.action !== action || data.verein_id !== clubId || typeof data.allowed !== "boolean") {
    throw sessionError("unavailable");
  }
  if (!data.allowed) throw sessionError(["busy", "ended"].includes(data.reason) ? data.reason : "ended");
  if (action !== "release" && (!Number.isFinite(data.lease_ms) || data.lease_ms <= 0 || data.lease_ms > MAX_LEASE_MS)) {
    throw sessionError("unavailable");
  }
  return data;
}

export function createClubSessionApi(client, { timeoutMs = 12000 } = {}) {
  return {
    async request(action, clubId, signal) {
      if (!["acquire", "renew", "release"].includes(action) || !clubId) throw sessionError("unavailable");
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) controller.abort();
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(sessionError("network"));
          }, timeoutMs);
        });
        const { data, error } = await Promise.race([
          client.rpc(CLUB_SESSION_RPC, { p_action: action, p_verein_id: clubId }).abortSignal(controller.signal),
          timeout,
        ]);
        if (controller.signal.aborted) throw sessionError("network");
        if (error) {
          if (["PGRST202", "42883"].includes(error.code)) throw sessionError("unavailable");
          if (error.code === "PT401" || error.code === "PT403") throw sessionError("ended");
          throw sessionError("network");
        }
        return validateLease(data, action, clubId);
      } catch (error) {
        throw error?.reason ? error : sessionError("network");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

// Dependency injection makes login cleanup testable without real accounts.
export function createClubLogin(client, api) {
  let pending = null;
  const login = async (email, password) => {
    let createdSession = false;
    let identity = null;
    try {
      const existing = await client.auth.getSession();
      if (existing.error) throw sessionError("network");
      let session = existing.data?.session;
      if (session) {
        if (session.user?.email?.toLowerCase() !== email.toLowerCase()) throw sessionError("different_account");
        const verified = await client.auth.getUser();
        if (verified.error || verified.data?.user?.id !== session.user.id) throw sessionError("ended");
      } else {
        const response = await client.auth.signInWithPassword({ email, password });
        if (response.error || !response.data?.session) {
          throw new Error("Login fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten.");
        }
        session = response.data.session;
        createdSession = true;
      }
      identity = sessionIdentity(session);
      if (!identity) throw sessionError("ended");
      const { data: club, error } = await client.from("vereine").select("id, vereinsname").eq("user_id", session.user.id).maybeSingle();
      if (error) throw sessionError("network");
      if (!club?.id || !club.vereinsname) throw new Error("Für dieses Konto wurde kein Verein gefunden.");
      await api.request("acquire", club.id);
      const latest = await client.auth.getSession();
      if (latest.error || identity !== sessionIdentity(latest.data?.session)) throw sessionError("account_changed");
      return { id: club.id, vereinsname: club.vereinsname, identity };
    } catch (error) {
      // NEVER global sign-out: a rejected second device must not evict the first.
      if (createdSession) {
        try {
          const latest = await client.auth.getSession();
          if (identity && identity === sessionIdentity(latest.data?.session)) {
            await client.auth.signOut({ scope: "local" });
          }
        } catch { /* Fail closed in UI; any server lease must expire independently. */ }
      }
      throw error;
    }
  };
  return (email, password) => {
    if (!pending) pending = login(email, password).finally(() => { pending = null; });
    return pending;
  };
}

export async function endClubSession(client, api, clubId, identity) {
  const current = await client.auth.getSession();
  if (current.error) throw sessionError("network");
  if (!identity || identity !== sessionIdentity(current.data?.session)) return;
  try { await api.request("release", clubId); } catch { /* Logout still revokes this auth session. */ }
  const latest = await client.auth.getSession();
  if (latest.error) throw sessionError("network");
  if (identity !== sessionIdentity(latest.data?.session)) return;
  const result = await client.auth.signOut({ scope: "local" });
  if (result.error) throw sessionError("network");
}

// The local Web Lock protects tabs, not devices. Only the server can protect devices.
export function createClubSessionMonitor({ api, clubId, locks, onChange, now = () => performance.now(), intervalMs = 30000 }) {
  let running = false;
  let generation = 0;
  let releaseTab;
  let timer;
  let deadlineTimer;
  let requestController;
  let pending;
  let localOwner = false;
  let terminal = false;
  let state = { phase: "checking", reason: null, started: false };
  const publish = (phase, reason = null) => {
    state = { phase, reason, started: state.started || phase === "active" };
    onChange(state);
  };
  const check = ({ pause = false } = {}) => {
    if (!running || !localOwner || terminal) return Promise.resolve();
    if (pending) return pending;
    const token = generation;
    const startedAt = now();
    requestController = new AbortController();
    if (pause || state.phase !== "active") publish("checking");
    pending = (async () => {
      try {
        const result = await api.request("renew", clubId, requestController.signal);
        if (!running || token !== generation) return;
        const remaining = result.lease_ms - (now() - startedAt);
        if (remaining <= 0) throw sessionError("ended");
        clearTimeout(deadlineTimer);
        deadlineTimer = setTimeout(() => {
          if (running && !terminal && token === generation) publish("blocked", "network");
        }, remaining);
        publish("active");
      } catch (error) {
        if (!running || token !== generation) return;
        clearTimeout(deadlineTimer);
        terminal = ["ended", "account_changed"].includes(error.reason);
        publish("blocked", error.reason || "network");
      } finally {
        if (token === generation) pending = null;
      }
    })();
    return pending;
  };
  return {
    getState: () => state,
    check,
    block(reason = "network") {
      if (!running) return;
      // Offline/focus events must not downgrade a permanent identity/session stop.
      if (terminal) return;
      generation += 1;
      requestController?.abort();
      pending = null;
      terminal = ["ended", "account_changed"].includes(reason);
      publish("blocked", reason);
    },
    start() {
      if (running) return;
      running = true;
      const token = ++generation;
      if (!locks?.request) { publish("blocked", "unsupported"); return; }
      Promise.resolve(locks.request(`rtliga-club-editor:${clubId}`, { ifAvailable: true }, async (lock) => {
        if (!running || token !== generation) return;
        if (!lock) { publish("blocked", "tab_busy"); return; }
        localOwner = true;
        const held = new Promise((resolve) => { releaseTab = resolve; });
        timer = setInterval(check, intervalMs);
        check();
        await held;
      })).catch(() => { if (running && token === generation) publish("blocked", "unsupported"); });
    },
    stop() {
      running = false;
      generation += 1;
      localOwner = false;
      clearInterval(timer);
      clearTimeout(deadlineTimer);
      requestController?.abort();
      pending = null;
      releaseTab?.();
    },
  };
}
