import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUB_SESSION_RPC, MAX_LEASE_MS, createClubSessionApi, createClubLogin,
  createClubSessionMonitor, endClubSession, sessionError, sessionIdentity,
  sessionMessage, validateLease,
} from "../src/lib/clubSessionCore.js";

const clubId = "test-club-a";
const lease = (action = "renew", extra = {}) => ({ api_version: 1, action, verein_id: clubId, allowed: true, lease_ms: MAX_LEASE_MS, ...extra });
const session = (user = "user-a", sid = "session-a") => ({
  user: { id: user, email: `${user}@example.invalid` },
  access_token: `test.${btoa(JSON.stringify({ sub: user, session_id: sid }))}.test`,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fakeLocks() {
  const held = new Set();
  return { request(name, options, callback) {
    assert.equal(options.ifAvailable, true);
    if (held.has(name)) return Promise.resolve(callback(null));
    held.add(name);
    return Promise.resolve(callback({ name })).finally(() => held.delete(name));
  } };
}

function rpcClient(response) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      const call = { name, args }; calls.push(call);
      return { abortSignal(signal) { call.signal = signal; return typeof response === "function" ? response() : Promise.resolve(response); } };
    },
  };
}

function loginFixture(existing = null) {
  let current = existing;
  const calls = [];
  const client = {
    auth: {
      async getSession() { return { data: { session: current } }; },
      async getUser() { return { data: { user: current?.user } }; },
      async signInWithPassword(input) { calls.push(["signIn", input.email]); current = session(); return { data: { session: current } }; },
      async signOut(options) { calls.push(["signOut", options]); current = null; return {}; },
    },
    from(table) {
      assert.equal(table, "vereine");
      return { select() { return { eq(column, user) {
        assert.equal(column, "user_id"); assert.equal(user, current.user.id);
        return { async maybeSingle() { return { data: { id: clubId, vereinsname: "Testverein A" } }; } };
      } }; } };
    },
  };
  const api = { async request(action, id) { calls.push([action, id]); return lease(action); } };
  return { client, api, calls, switchSession(next) { current = next; } };
}

test("Schnittstelle akzeptiert nur zur Anfrage passende bestätigte Antworten", () => {
  assert.equal(validateLease(lease(), "renew", clubId).allowed, true);
  for (const data of [null, {}, lease("acquire"), lease("renew", { api_version: 2 }), lease("renew", { verein_id: "other" }), lease("renew", { allowed: "true" })]) {
    assert.throws(() => validateLease(data, "renew", clubId), { reason: "unavailable" });
  }
});

test("Ungültige oder zu lange Laufzeiten bleiben gesperrt", () => {
  for (const lease_ms of [null, "600000", 0, -1, Infinity, NaN, MAX_LEASE_MS + 1]) {
    assert.throws(() => validateLease(lease("renew", { lease_ms }), "renew", clubId), { reason: "unavailable" });
  }
  assert.equal(validateLease(lease("release", { lease_ms: undefined }), "release", clubId).allowed, true);
});

test("Ablehnung wird nie als erfolgreiche Anmeldung gewertet", () => {
  assert.throws(() => validateLease(lease("acquire", { allowed: false, reason: "busy" }), "acquire", clubId), { reason: "busy" });
  assert.throws(() => validateLease(lease("renew", { allowed: false, reason: "unknown" }), "renew", clubId), { reason: "ended" });
});

test("RPC sendet nur Aktion und Verein, keine selbst erfundene Sitzungsberechtigung", async () => {
  const client = rpcClient({ data: lease() });
  await createClubSessionApi(client).request("renew", clubId);
  assert.equal(client.calls[0].name, CLUB_SESSION_RPC);
  assert.deepEqual(client.calls[0].args, { p_action: "renew", p_verein_id: clubId });
});

test("Fehlende Migration liefert verständlichen Sperrhinweis ohne Fallback", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const client = rpcClient({ error: { code } });
    await assert.rejects(createClubSessionApi(client).request("acquire", clubId), { reason: "unavailable" });
    assert.equal(client.calls.length, 1);
  }
});

test("Sitzungsfehler und technische Fehler werden getrennt behandelt", async () => {
  for (const code of ["PT401", "PT403"]) {
    await assert.rejects(createClubSessionApi(rpcClient({ error: { code } })).request("renew", clubId), { reason: "ended" });
  }
  await assert.rejects(createClubSessionApi(rpcClient({ error: { code: "other", message: "secret" } })).request("renew", clubId), (error) => error.reason === "network" && !error.message.includes("secret"));
});

test("Netzwerk-Timeout bricht Anfrage ab und öffnet den Bereich nicht", async () => {
  const client = rpcClient(() => new Promise(() => {}));
  await assert.rejects(createClubSessionApi(client, { timeoutMs: 10 }).request("renew", clubId), { reason: "network" });
  assert.equal(client.calls[0].signal.aborted, true);
});

test("Abgebrochene Antwort wird nicht mehr übernommen", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createClubSessionApi(rpcClient({ data: lease() })).request("renew", clubId, controller.signal), { reason: "network" });
});

test("Lokale Sitzungsidentität erkennt Benutzer-/Sitzungswechsel und kaputte Tokens", () => {
  assert.equal(sessionIdentity(session()), "user-a:session-a");
  assert.notEqual(sessionIdentity(session("user-a", "session-b")), sessionIdentity(session()));
  assert.equal(sessionIdentity({ user: { id: "other" }, access_token: session().access_token }), null);
  assert.equal(sessionIdentity(null), null);
  assert.equal(sessionIdentity({ access_token: "broken" }), null);
});

test("Erste Anmeldung wartet auf bestätigte Reservierung", async () => {
  const f = loginFixture(); const response = deferred();
  f.api.request = () => response.promise;
  let completed = false;
  const result = createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic").then((value) => { completed = true; return value; });
  await tick(); assert.equal(completed, false);
  response.resolve(lease("acquire"));
  assert.deepEqual(await result, { id: clubId, vereinsname: "Testverein A", identity: "user-a:session-a" });
});

test("Abgewiesenes zweites Gerät meldet ausschließlich seine neue Sitzung ab", async () => {
  const f = loginFixture(); f.api.request = async () => { throw sessionError("busy"); };
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), { reason: "busy" });
  assert.deepEqual(f.calls.filter(([name]) => name === "signOut"), [["signOut", { scope: "local" }]]);
});

test("Wiederverwendung derselben Browsersitzung ersetzt keine Auth-Sitzung", async () => {
  const f = loginFixture(session());
  await createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic");
  assert.equal(f.calls.some(([name]) => name === "signIn" || name === "signOut"), false);
});

test("Ablehnung einer bestehenden Browsersitzung meldet andere Tabs nicht ab", async () => {
  const f = loginFixture(session()); f.api.request = async () => { throw sessionError("busy"); };
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), { reason: "busy" });
  assert.equal(f.calls.some(([name]) => name === "signOut"), false);
});

test("Anderes bestehendes Konto einschließlich Admin wird nicht ersetzt", async () => {
  const f = loginFixture(session("admin", "admin-session"));
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), { reason: "different_account" });
  assert.deepEqual(f.calls, []);
});

test("Doppelklick startet nur einen Login", async () => {
  const f = loginFixture(); const login = createClubLogin(f.client, f.api);
  const first = login("user-a@example.invalid", "synthetic");
  assert.equal(first, login("user-a@example.invalid", "synthetic"));
  await first;
  assert.equal(f.calls.filter(([name]) => name === "signIn").length, 1);
});

test("Kontowechsel während Login wird weder geöffnet noch fremd abgemeldet", async () => {
  const f = loginFixture();
  f.api.request = async () => { f.switchSession(session("other", "other-session")); return lease("acquire"); };
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), { reason: "account_changed" });
  assert.equal(f.calls.some(([name]) => name === "signOut"), false);
});

test("Abmelden gibt zuerst die Reservierung frei, dann nur die lokale Auth-Sitzung", async () => {
  const f = loginFixture(session());
  await endClubSession(f.client, f.api, clubId, sessionIdentity(session()));
  assert.deepEqual(f.calls, [["release", clubId], ["signOut", { scope: "local" }]]);
});

test("Abmelden versucht Auth-Widerruf auch wenn Freigabe fehlschlägt", async () => {
  const f = loginFixture(session()); f.api.request = async () => { throw sessionError("network"); };
  await endClubSession(f.client, f.api, clubId, sessionIdentity(session()));
  assert.deepEqual(f.calls, [["signOut", { scope: "local" }]]);
});

test("Abmelden nach Kontowechsel beendet nicht das neue Konto", async () => {
  const f = loginFixture(session());
  f.api.request = async () => { f.switchSession(session("other")); return lease("release"); };
  await endClubSession(f.client, f.api, clubId, sessionIdentity(session()));
  assert.equal(f.calls.some(([name]) => name === "signOut"), false);
});

function monitorFixture(t, options = {}) {
  const changes = [];
  const api = { async request() { return lease(); } };
  const monitor = createClubSessionMonitor({ api, clubId, locks: fakeLocks(), onChange: (state) => changes.push(state), intervalMs: 1000000, ...options });
  t.after(() => monitor.stop());
  return { monitor, changes, api };
}

test("Vereinsseite bleibt bis zur Serverbestätigung geschlossen", async (t) => {
  const response = deferred();
  const { monitor } = monitorFixture(t, { api: { request: () => response.promise } });
  monitor.start(); assert.equal(monitor.getState().started, false);
  response.resolve(lease()); await tick();
  assert.equal(monitor.getState().phase, "active");
});

test("Zweiter Eingabetab wird vor jedem Serveraufruf gesperrt", async (t) => {
  const locks = fakeLocks(); let calls = 0;
  const api = { async request() { calls++; return lease(); } };
  const a = monitorFixture(t, { locks, api }).monitor;
  const b = monitorFixture(t, { locks, api }).monitor;
  a.start(); b.start(); await tick();
  assert.equal(a.getState().phase, "active");
  assert.equal(b.getState().reason, "tab_busy");
  assert.equal(calls, 1);
  a.stop(); await tick();
  b.stop(); b.start(); await tick();
  assert.equal(b.getState().phase, "active");
});

test("Nicht unterstützte Tabsperre wird nicht stillschweigend umgangen", (t) => {
  const { monitor } = monitorFixture(t, { locks: undefined });
  monitor.start(); assert.equal(monitor.getState().reason, "unsupported");
});

test("Späte Serverantwort nach Verlassen kann nichts mehr freischalten", async (t) => {
  const response = deferred();
  const { monitor, changes } = monitorFixture(t, { api: { request: () => response.promise } });
  monitor.start(); monitor.stop(); response.resolve(lease()); await tick();
  assert.equal(changes.some((state) => state.phase === "active"), false);
});

test("Verbindungsfehler sperrt Eingaben, lässt vorhandene Entwürfe aber montiert", async (t) => {
  const { monitor, api } = monitorFixture(t);
  monitor.start(); await tick();
  api.request = async () => { throw sessionError("network"); };
  await monitor.check();
  assert.deepEqual(monitor.getState(), { phase: "blocked", reason: "network", started: true });
  api.request = async () => lease();
  await monitor.check(); assert.equal(monitor.getState().phase, "active");
});

test("Abgelaufene Sitzung wird nicht automatisch neu reserviert", async (t) => {
  const actions = [];
  const { monitor } = monitorFixture(t, { api: { async request(action) { actions.push(action); throw sessionError("ended"); } } });
  monitor.start(); await tick(); await monitor.check();
  assert.deepEqual(actions, ["renew"]);
  assert.equal(monitor.getState().reason, "ended");
});

test("Kontowechsel schlägt eine verspätete erfolgreiche Antwort", async (t) => {
  const response = deferred();
  const { monitor } = monitorFixture(t, { api: { request: () => response.promise } });
  monitor.start(); monitor.block("account_changed"); response.resolve(lease()); await tick();
  assert.equal(monitor.getState().reason, "account_changed");
});

test("Netzwerkereignisse können eine beendete oder gewechselte Sitzung nicht entsperren", async (t) => {
  for (const reason of ["ended", "account_changed"]) {
    let calls = 0;
    const { monitor } = monitorFixture(t, { api: { async request() { calls++; return lease(); } } });
    monitor.start(); await tick();
    monitor.block(reason);
    monitor.block("network");
    await monitor.check({ pause: true });
    assert.equal(monitor.getState().reason, reason);
    assert.equal(calls, 1);
  }
});

test("Abgelaufene lokale Frist sperrt auch ohne weiteren Heartbeat", async (t) => {
  const { monitor } = monitorFixture(t, { api: { async request() { return lease("renew", { lease_ms: 15 }); } } });
  monitor.start(); await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(monitor.getState().phase, "blocked");
});

test("Anfragelaufzeit wird von der bestätigten Restlaufzeit abgezogen", async (t) => {
  let clock = 0;
  const { monitor } = monitorFixture(t, { now: () => clock, api: { async request() { clock = MAX_LEASE_MS + 1; return lease(); } } });
  monitor.start(); await tick();
  assert.equal(monitor.getState().reason, "ended");
});

test("Normale Hintergrundprüfung blendet kein störendes Fenster ein", async (t) => {
  const { monitor, api } = monitorFixture(t);
  monitor.start(); await tick();
  const response = deferred(); api.request = () => response.promise;
  const checked = monitor.check();
  assert.equal(monitor.getState().phase, "active");
  response.resolve(lease()); await checked;
});

test("Sperrhinweise enthalten keine technischen Tokens oder realen Kontaktdaten", () => {
  for (const reason of ["busy", "ended", "network", "unavailable", "tab_busy", "unsupported", "account_changed", "different_account"]) {
    const text = sessionMessage(reason);
    assert.ok(text.length > 30);
    assert.equal(/@|access_token|service_role|eyJ/.test(text), false);
  }
});

test("Verschiedene Vereine blockieren sich lokal nicht gegenseitig", async (t) => {
  const locks = fakeLocks();
  const first = monitorFixture(t, { locks }).monitor;
  const second = monitorFixture(t, { locks, clubId: "test-club-b" }).monitor;
  first.start(); second.start(); await tick();
  assert.equal(first.getState().phase, "active");
  assert.equal(second.getState().phase, "active");
});

test("Falsches Kennwort startet keine Reservierung", async () => {
  const f = loginFixture();
  f.client.auth.signInWithPassword = async () => ({ error: { message: "invalid" } });
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), /Login fehlgeschlagen/);
  assert.deepEqual(f.calls, []);
});

test("Unbestätigter bestehender Benutzer erhält keine Reservierung", async () => {
  const f = loginFixture(session());
  f.client.auth.getUser = async () => ({ error: { message: "invalid" } });
  await assert.rejects(createClubLogin(f.client, f.api)("user-a@example.invalid", "synthetic"), { reason: "ended" });
  assert.deepEqual(f.calls, []);
});

test("Abmeldefehler wird nicht als erfolgreiche Abmeldung ausgegeben", async () => {
  const f = loginFixture(session());
  f.client.auth.signOut = async () => ({ error: { message: "offline" } });
  await assert.rejects(endClubSession(f.client, f.api, clubId, sessionIdentity(session())), { reason: "network" });
});

test("Ungültige Aktionen erzeugen keinen RPC-Aufruf", async () => {
  const client = rpcClient({ data: lease() });
  await assert.rejects(createClubSessionApi(client).request("steal", clubId), { reason: "unavailable" });
  assert.equal(client.calls.length, 0);
});

test("Parallele Erneuerungsanforderungen werden zusammengefasst", async (t) => {
  const response = deferred(); let calls = 0;
  const { monitor } = monitorFixture(t, { api: { request() { calls++; return response.promise; } } });
  monitor.start();
  const one = monitor.check(); const two = monitor.check();
  assert.equal(one, two); assert.equal(calls, 1);
  response.resolve(lease()); await one;
});
