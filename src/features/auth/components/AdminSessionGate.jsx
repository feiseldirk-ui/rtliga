import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import supabase from '../../../lib/supabase/client';
import { createClubSessionMonitor, sessionIdentity } from '../../../lib/clubSessionCore';
import { adminSessionMessage } from '../../../lib/adminSessionCore';
import { adminSessionApi, adminLogin, readAdminIdentity, writeAdminIdentity } from '../../../lib/adminSession';
import AppDialog from '../../../shared/ui/AppDialog';

export default function AdminSessionGate({ children }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [record, setRecord] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [switchAvailable, setSwitchAvailable] = useState(false);
  const [state, setState] = useState({ phase: 'checking', started: false });
  const [attempt, setAttempt] = useState(0);
  const monitorRef = useRef(null);
  const recordRef = useRef(null);
  const mounted = useRef(false);
  recordRef.current = record;

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (cancelled) return;
      if (authError) throw authError;
      const session = data?.session;
      const identity = sessionIdentity(session);
      if (identity && readAdminIdentity() === identity) {
        setRecord({ identity, email: session.user.email, userId: session.user.id });
      } else if (session) setEmail(value => value || session.user.email || '');
      setReady(true);
    }).catch(() => { if (!cancelled) { setError('Anmeldung konnte nicht geprüft werden. Bitte Seite neu laden.'); setReady(true); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const previous = recordRef.current;
      if (previous && sessionIdentity(session) !== previous.identity) monitorRef.current?.block('account_changed');
    });
    return () => { cancelled = true; mounted.current = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!record) return undefined;
    let cancelled = false;
    const monitor = createClubSessionMonitor({
      api: adminSessionApi, clubId: record.userId,
      lockName: `rtliga-admin-editor:${record.userId}`, locks: navigator.locks,
      now: () => Date.now(),
      onChange: next => { if (!cancelled) setState(next); },
    });
    monitorRef.current = monitor;
    // Restores only an already accepted lease. Never acquire on reload/focus.
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (cancelled) return;
      if (authError) throw authError;
      if (sessionIdentity(data?.session) !== record.identity) {
        setState({ phase: 'blocked', reason: 'account_changed', started: false }); return;
      }
      monitor.start();
    }).catch(() => { if (!cancelled) setState({ phase: 'blocked', reason: 'network', started: false }); });
    const check = () => { if (document.visibilityState === 'visible') void monitor.check({ pause: true }); };
    const offline = () => monitor.block('network');
    const ended = () => monitor.block('ended');
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('offline', offline);
    window.addEventListener('rtliga-admin-session-ended', ended);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true; monitor.stop();
      window.removeEventListener('focus', check); window.removeEventListener('online', check);
      window.removeEventListener('offline', offline); window.removeEventListener('rtliga-admin-session-ended', ended);
      document.removeEventListener('visibilitychange', check);
    };
  }, [record, attempt]);

  const logout = () => window.dispatchEvent(new CustomEvent('rtliga-request-logout', { detail: { target: '/' } }));
  const login = async event => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(''); setSwitchAvailable(false);
    try {
      const accepted = await adminLogin(email.trim().toLowerCase(), password);
      if (!mounted.current) return;
      writeAdminIdentity(accepted.identity);
      setState({ phase: 'checking', started: false });
      setRecord(accepted); setPassword('');
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        setSwitchAvailable(['ended','different_account'].includes(failure.reason));
      }
    } finally { if (mounted.current) setLoading(false); }
  };
  if (!ready) return <div className="card m-6 p-8 text-center">Adminzugang wird geprüft…</div>;
  if (!record) return <div className="mx-auto max-w-3xl px-4 py-10">
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 px-6 py-8 text-white">
        <p className="text-sm uppercase tracking-widest">RTLiga Verwaltung</p>
        <h1 className="mt-3 text-3xl font-semibold">Admin-Anmeldung</h1>
        <p className="mt-3 text-sm">Pro Admin-Konto ist eine Sitzung erlaubt. Die erste Anmeldung bleibt aktiv.</p>
      </div>
      <form onSubmit={login} className="space-y-5 p-6">
        <label className="block text-sm font-semibold">Admin-E-Mail
          <input className="input mt-2" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm font-semibold">Kennwort
          <input className="input mt-2" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        <button type="button" className="text-sm text-indigo-700" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Kennwort verbergen' : 'Kennwort anzeigen'}</button>
        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
          {switchAvailable && <button type="button" className="btn btn-secondary mt-3" onClick={() => window.dispatchEvent(new CustomEvent('rtliga-confirm-account-switch', { detail: { target: '/admin' } }))}>Gespeichertes Konto wechseln</button>}
        </div>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Anmeldung läuft…' : 'Admin anmelden'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/passwort-vergessen?context=admin&back=%2Fadmin&email=${encodeURIComponent(email)}`)}>Kennwort vergessen?</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>Zurück</button>
        </div>
      </form>
    </div>
  </div>;

  const blocked = state.phase !== 'active';
  const secondary = ['tab_busy','unsupported','account_changed'].includes(state.reason);
  return <>
    <div inert={blocked || undefined}>{state.started ? children(record, logout) : null}</div>
    <AppDialog open={blocked} title={state.phase === 'checking' ? 'Admin-Sitzung wird geprüft…' : 'Admin-Sitzung geschützt'}>
      <p className="mt-4 text-sm leading-6 text-zinc-600">{state.phase === 'checking' ? 'Bitte kurz warten.' : adminSessionMessage(state.reason)}</p>
      {state.started && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Ungespeicherte Eingaben bleiben bei einer vorübergehenden Störung in diesem Tab erhalten. Beim Abmelden gehen sie verloren.</p>}
      {state.phase === 'blocked' && <div className="mt-5 flex flex-wrap gap-3">
        {!['ended','account_changed','unsupported'].includes(state.reason) && <button type="button" className="btn btn-primary" onClick={() => {
          if (!state.started || state.reason === 'tab_busy') setAttempt(value => value + 1);
          else void monitorRef.current?.check();
        }}>Erneut prüfen</button>}
        <button type="button" className="btn btn-secondary" onClick={secondary ? () => navigate('/') : logout}>{secondary ? 'Zur Startseite' : 'Abmelden'}</button>
      </div>}
    </AppDialog>
  </>;
}
