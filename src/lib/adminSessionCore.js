import { sessionIdentity } from './clubSessionCore.js';

export const ADMIN_SESSION_KEY = 'rtliga-admin-session-v1';
export function adminSessionMessage(reason) {
  return ({
    busy: 'Dieses Admin-Konto ist bereits auf einem anderen Gerät angemeldet. Die erste Sitzung bleibt aktiv. Bitte dort „Verlassen“ wählen. Nach einem Verbindungsabbruch wird der Zugang spätestens zehn Minuten nach der letzten Verlängerung frei.',
    ended: 'Diese Admin-Sitzung ist abgelaufen oder wurde beendet. Bitte das gespeicherte Konto abmelden und neu anmelden.',
    not_admin: 'Dieses Konto ist nicht als Admin freigeschaltet.',
    different_account: 'In diesem Browser ist bereits ein anderes Konto gespeichert. Bitte dieses zuerst regulär abmelden.',
    account_changed: 'Die Anmeldung wurde gewechselt. Diese Admin-Sitzung bleibt gesperrt.',
    tab_busy: 'Dieses Admin-Konto wird bereits in einem anderen Tab dieses Browsers verwendet. Bitte dort weiterarbeiten oder den anderen Tab schließen.',
    unsupported: 'Die benötigte Tabsperre wird nicht unterstützt. Bitte einen aktuellen Browser verwenden.',
    unavailable: 'Die Admin-Sperre ist auf dem Server noch nicht eingerichtet oder nicht kompatibel. Der Adminbereich bleibt gesperrt.',
    network: 'Die Admin-Sitzung konnte nicht bestätigt werden. Eingaben bleiben gesperrt. Bitte Verbindung prüfen und erneut versuchen.',
  })[reason] || 'Admin-Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
}
const failure = reason => Object.assign(new Error(adminSessionMessage(reason)), { reason });

export function createAdminSessionApi(client, { timeoutMs = 12000 } = {}) {
  return { async request(action, _unused, signal) {
    if (!['acquire','renew','release'].includes(action)) throw failure('unavailable');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timer;
    try {
      const { data, error } = await Promise.race([
        client.rpc('rtliga_admin_session_v1', { p_action: action }).abortSignal(controller.signal),
        new Promise((_, reject) => { timer = setTimeout(() => { abort(); reject(failure('network')); }, timeoutMs); }),
      ]);
      if (controller.signal.aborted) throw failure('network');
      if (error) throw failure(['PGRST202','42883'].includes(error.code) ? 'unavailable' : ['PT401','PT403'].includes(error.code) ? 'ended' : 'network');
      if (data?.api_version !== 1 || data.action !== action || typeof data.allowed !== 'boolean') throw failure('unavailable');
      if (!data.allowed) throw failure(['busy','ended','not_admin'].includes(data.reason) ? data.reason : 'ended');
      if (action !== 'release' && (!Number.isFinite(data.lease_ms) || data.lease_ms <= 0 || data.lease_ms > 600000)) throw failure('unavailable');
      return data;
    } catch (error) { throw error?.reason ? error : failure('network'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  } };
}

export function createAdminLogin(client, api) {
  let pending;
  const login = async (email, password) => {
    let created = false, identity;
    try {
      const existing = await client.auth.getSession();
      if (existing.error) throw failure('network');
      let session = existing.data?.session;
      if (session) {
        if (session.user?.email?.toLowerCase() !== email.toLowerCase()) throw failure('different_account');
        const verified = await client.auth.getUser();
        if (verified.error || verified.data?.user?.id !== session.user.id) throw failure('ended');
      } else {
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error || !result.data?.session) throw new Error('Admin-Login fehlgeschlagen. Bitte Kennwort prüfen.');
        session = result.data.session; created = true;
      }
      identity = sessionIdentity(session);
      if (!identity) throw failure('ended');
      await api.request('acquire');
      const latest = await client.auth.getSession();
      if (latest.error || sessionIdentity(latest.data?.session) !== identity) throw failure('account_changed');
      return { identity, email: session.user.email, userId: session.user.id };
    } catch (error) {
      // A rejected newly created session is local-only. Never evict device A.
      if (created && identity) {
        const latest = await client.auth.getSession().catch(() => null);
        if (sessionIdentity(latest?.data?.session) === identity) {
          const result = await client.auth.signOut({ scope: 'local' }).catch(() => ({ error: true }));
          if (result.error) throw failure('ended');
        }
      }
      throw error;
    }
  };
  return (email, password) => {
    if (!pending) pending = login(email,password).finally(() => { pending = null; });
    return pending;
  };
}
