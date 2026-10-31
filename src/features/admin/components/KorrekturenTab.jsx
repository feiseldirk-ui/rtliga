import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../../lib/supabase/client';
import { getActiveSeason } from '../../../lib/seasonScope';
import ConfirmDialog from '../../../shared/ui/ConfirmDialog';

const classes = ['Schüler', 'Jugend', 'Junioren', 'Damen', 'Herren', 'Altersklasse'];
const seriesKeys = ['s1', 's2', 's3', 's4', 's5', 's6'];
const expectedResult = row => Object.fromEntries([...seriesKeys, 'status', 'vorname', 'nachname', 'altersklasse'].map(key => [key, row[key]]));

export default function KorrekturenTab() {
  const [participants, setParticipants] = useState([]);
  const [results, setResults] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState(getActiveSeason());
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const responses = await Promise.all([
        supabase.from('verein_teilnehmer').select('*').eq('saison', String(season)).order('name'),
        supabase.from('verein_ergebnisse').select('*').eq('saison', String(season)).order('wettkampf'),
        supabase.from('vereine').select('id,vereinsname').order('vereinsname'),
      ]);
      for (const response of responses) if (response.error) throw response.error;
      setParticipants(responses[0].data || []); setResults(responses[1].data || []); setClubs(responses[2].data || []);
    } catch (err) { setError(err.message || 'Daten konnten nicht geladen werden.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* explicit reload keeps active drafts intact */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clubNames = useMemo(() => new Map(clubs.map(c => [c.id, c.vereinsname])), [clubs]);
  const person = participants.find(p => String(p.id) === selected);
  const visible = participants.filter(p => `${p.vorname} ${p.name} ${p.altersklasse} ${clubNames.get(p.verein_id) || ''}`.toLowerCase().includes(query.toLowerCase()));
  const entries = results.filter(r => String(r.teilnehmer_id) === selected);

  function editIdentity() {
    setDraft({ type: 'identity', original: person, first: person.vorname, last: person.name, category: person.altersklasse, reason: '' });
    setError(''); setNotice('');
  }
  function editResult(row) {
    setDraft({ type: 'result', original: row, series: seriesKeys.map(k => String(row[k] ?? 0)), reason: '' });
    setError(''); setNotice('');
  }
  function prepare(event) {
    event.preventDefault(); setError('');
    if (draft.reason.trim().length < 5) { setError('Bitte den Änderungsgrund mit mindestens 5 Zeichen beschreiben.'); return; }
    if (draft.type === 'result' && draft.series.some(s => s === '' || !Number.isInteger(Number(s)) || Number(s) < 0 || Number(s) > 100)) {
      setError('Bitte alle Serien als ganze Zahlen zwischen 0 und 100 eintragen.'); return;
    }
    setConfirm(true);
  }
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = draft.type === 'result'
        ? await supabase.rpc('admin_correct_result', { p_id: draft.original.id, p_series: draft.series.map(Number), p_reason: draft.reason.trim(), p_expected: expectedResult(draft.original) })
        : await supabase.rpc('admin_correct_participant', { p_id: person.id, p_first_name: draft.first.trim(), p_last_name: draft.last.trim(), p_category: draft.category, p_reason: draft.reason.trim(), p_expected: { vorname: draft.original.vorname, name: draft.original.name, altersklasse: draft.original.altersklasse } });
      if (response.error) throw response.error;
      setDraft(null); setConfirm(false); setNotice('Korrektur gespeichert und im Änderungsprotokoll dokumentiert.');
      await load(); window.dispatchEvent(new CustomEvent('rtliga-admin-refresh'));
    } catch (err) { setConfirm(false); setError(err.message || 'Korrektur konnte nicht gespeichert werden.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">Admin-Korrekturen sind auch nach Ablauf eines WK-Zeitfensters möglich. Jede Änderung benötigt eine Begründung. Alte und neue Werte, Zeitpunkt und Admin werden dauerhaft protokolliert.</div>
    {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</div>}
    <fieldset disabled={Boolean(draft) || loading} className="grid gap-4 sm:grid-cols-[120px_auto_1fr]">
      <label className="text-sm font-semibold">Saison<input className="input mt-1" type="number" min="2000" max="2100" value={season} onChange={e => setSeason(e.target.value)} /></label>
      <button type="button" className="btn btn-secondary self-end" onClick={() => { setSelected(''); void load(); }}>{loading ? 'Lädt…' : 'Neu laden'}</button>
      <label className="text-sm font-semibold">Suche nach Name, Verein oder Klasse<input className="input mt-1" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </fieldset>
    <label className="block text-sm font-semibold">Teilnehmer auswählen<select className="input mt-1" value={selected} disabled={Boolean(draft)} onChange={e => { setSelected(e.target.value); setNotice(''); }}><option value="">Bitte auswählen</option>{visible.map(p => <option key={p.id} value={p.id}>{p.vorname} {p.name} · {p.altersklasse} · {clubNames.get(p.verein_id) || p.verein}</option>)}</select></label>
    {person && !draft && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-4"><div><h3 className="font-bold">{person.vorname} {person.name}</h3><p className="text-sm text-zinc-600">{person.altersklasse} · {clubNames.get(person.verein_id)}</p></div><button className="btn btn-secondary" onClick={editIdentity}>Name / Klasse korrigieren</button></div>
      <div className="grid gap-3 lg:grid-cols-2">{entries.map(r => <article key={r.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex justify-between gap-3"><h4 className="font-bold">WK {r.wettkampf}</h4><span className="font-bold text-indigo-700">{r.gesamt} Ringe</span></div><p className="my-3 text-sm text-zinc-600">{seriesKeys.map((k, i) => `S${i + 1}: ${r[k] ?? 0}`).join(' · ')}</p><button className="btn btn-secondary w-full" onClick={() => editResult(r)}>Ergebnis korrigieren</button></article>)}</div>
      {!entries.length && <p className="rounded-2xl bg-zinc-50 p-4 text-zinc-600">Für diesen Teilnehmer sind noch keine Ergebnisse vorhanden.</p>}
    </>}
    {draft && <form onSubmit={prepare} className="space-y-4 rounded-3xl border border-indigo-200 bg-white p-5">
      <h3 className="text-lg font-bold">{draft.type === 'result' ? `Ergebnis korrigieren · WK ${draft.original.wettkampf}` : 'Name / Klasse korrigieren'} · {person?.vorname} {person?.name}</h3>
      {draft.type === 'result' ? <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{draft.series.map((s, i) => <label key={i} className="text-sm font-semibold">S{i + 1} <span className="font-normal text-zinc-500">(bisher {draft.original[seriesKeys[i]] ?? 0})</span><input className="input mt-1" type="number" min="0" max="100" step="1" required inputMode="numeric" value={s} disabled={busy || (person?.altersklasse === 'Schüler' && i > 3)} onChange={e => setDraft({ ...draft, series: draft.series.map((v, j) => j === i ? e.target.value : v) })} /></label>)}</div><div className="rounded-2xl bg-indigo-50 p-4 font-semibold text-indigo-900">LL: {draft.series.slice(0, 3).reduce((s, v) => s + Number(v), 0)} · SL: {draft.series.slice(3).reduce((s, v) => s + Number(v), 0)} · Gesamt: {draft.series.reduce((s, v) => s + Number(v), 0)}</div></>
        : <div className="grid gap-3 sm:grid-cols-3"><label>Vorname<input className="input mt-1" required maxLength="100" value={draft.first} onChange={e => setDraft({ ...draft, first: e.target.value })} /></label><label>Nachname<input className="input mt-1" required maxLength="100" value={draft.last} onChange={e => setDraft({ ...draft, last: e.target.value })} /></label><label>Klasse<select className="input mt-1" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{classes.map(c => <option key={c}>{c}</option>)}</select></label></div>}
      <label className="block text-sm font-semibold">Grund der Änderung (Pflicht)<textarea className="input mt-1 min-h-28" required minLength="5" maxLength="2000" placeholder="Zum Beispiel: Zahlendreher, nach Abgleich mit dem Originalprotokoll korrigiert." value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>
      <div className="flex flex-wrap gap-3"><button className="btn btn-primary" disabled={busy}>Korrektur prüfen</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Abbrechen</button></div>
    </form>}
    <ConfirmDialog open={confirm} tone="warning" title="Korrektur speichern und protokollieren?" busy={busy} confirmLabel="Korrektur speichern" onCancel={() => setConfirm(false)} onConfirm={save}
      message={draft ? `${person?.vorname} ${person?.name}\n${draft.type === 'result' ? `WK ${draft.original.wettkampf}\nAlt: ${seriesKeys.map(k => draft.original[k] ?? 0).join(' / ')}\nNeu: ${draft.series.join(' / ')}` : `Alt: ${draft.original.vorname} ${draft.original.name} · ${draft.original.altersklasse}\nNeu: ${draft.first} ${draft.last} · ${draft.category}`}\n\nGrund: ${draft.reason}` : ''} />
  </div>;
}
