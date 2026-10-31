import AppSelect from '../../../shared/ui/AppSelect';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import supabase from '../../../lib/supabase/client';

function date(value) { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)); }
function valueText(value) {
  try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([key, val]) => `${key}: ${val ?? '–'}`).join(' · '); } catch { /* Plain text from identity corrections. */ }
  return value || '–';
}

export default function AenderungsprotokollTab() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('alle');
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (before = null) => {
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('list_admin_corrections', { p_before_id: before, p_limit: 100 });
      if (rpcError) throw rpcError;
      setRows(previous => before ? [...previous, ...(data || [])] : data || []);
      setHasMore((data || []).length === 100);
    } catch (err) { setError(err.message || 'Das Änderungsprotokoll konnte nicht geladen werden.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => rows.filter(r => (type === 'alle' || r.entity_type === type) &&
    [r.participant_label, r.club_label, r.teilnehmer_id, r.verein_id, r.saison, r.wettkampf, r.admin_email, r.field_name, r.old_value, r.new_value, r.bemerkung].join(' ').toLowerCase().includes(query.toLowerCase())), [rows, query, type]);
  function exportPdf() {
    const doc = new jsPDF(); let y = 20;
    const write = (text, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(text), 178);
      for (const line of lines) { if (y > 275) { doc.addPage(); y = 20; } doc.text(line, 16, y); y += 5; }
    };
    doc.setFontSize(15); write('RTLiga – Änderungsprotokoll', true); y += 3;
    doc.setFontSize(10); write(`Erstellt: ${date(new Date())} · ${filtered.length} angezeigte Einträge`);
    if (hasMore) write('Weitere Einträge sind vorhanden. Für den vollständigen Export zuerst alle Einträge nachladen.');
    y += 5;
    for (const r of filtered) {
      write(`#${r.id} · ${date(r.created_at)} · ${r.admin_email || 'Admin'}`, true);
      write(`${r.club_label || `Verein ${r.verein_id || ''}`} · ${r.participant_label || `Teilnehmer ${r.teilnehmer_id || '–'}`} · Saison ${r.saison || '–'}${r.wettkampf ? ` · WK ${r.wettkampf}` : ''}`);
      write(`Feld: ${r.field_name}`); write(`Alt: ${valueText(r.old_value)}`); write(`Neu: ${valueText(r.new_value)}`); write(`Grund: ${r.bemerkung}`); y += 6;
    }
    doc.save('RTLiga_Aenderungsprotokoll_Admin.pdf');
  }
  return <div className="space-y-4">
    <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">Nur für Admins: Jede dokumentierte Korrektur enthält Zeitpunkt, Bearbeiter, Begründung sowie alten und neuen Wert. Protokolleinträge können hier weder verändert noch gelöscht werden.</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Suche (Name, Verein, Saison, Grund, Admin)<input className="input mt-1" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="text-sm font-semibold">Bereich<AppSelect className="input mt-1" value={type} onChange={e => setType(e.target.value)}><option value="alle">Alle Änderungen</option><option value="ergebnis">Ergebnisse</option><option value="teilnehmer">Namen und Klassen</option><option value="verein">Vereinsnamen</option></AppSelect></label></div>
    <div className="flex flex-wrap items-center gap-3"><button className="btn btn-secondary" disabled={busy} onClick={() => load()}>Aktualisieren</button><button className="btn btn-secondary" disabled={!filtered.length || busy} onClick={exportPdf}>Angezeigtes Protokoll als PDF</button><span className="text-sm text-zinc-500">{filtered.length} angezeigt · {rows.length} geladen</span></div>
    {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {!busy && !rows.length && !error && <p className="rounded-2xl bg-zinc-50 p-4 text-zinc-600">Noch keine Korrekturen dokumentiert.</p>}
    {filtered.map(r => <article key={r.id} className="space-y-3 rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{r.field_name}{r.wettkampf ? ` · WK ${r.wettkampf}` : ''} <span className="text-sm font-normal text-zinc-500">#{r.id}</span></h3><span className="text-sm text-zinc-600">{date(r.created_at)}</span></div>
      <p className="text-sm text-zinc-600">{r.participant_label || (r.teilnehmer_id ? `Teilnehmer #${r.teilnehmer_id}` : 'Verein')} · {r.club_label || r.verein_id} {r.saison ? `· Saison ${r.saison}` : ''}</p>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-rose-50 p-3"><strong className="text-sm text-rose-800">Bisher</strong><p className="mt-1 whitespace-pre-wrap break-words text-sm">{valueText(r.old_value)}</p></div><div className="rounded-2xl bg-emerald-50 p-3"><strong className="text-sm text-emerald-800">Korrigiert</strong><p className="mt-1 whitespace-pre-wrap break-words text-sm">{valueText(r.new_value)}</p></div></div>
      <p className="whitespace-pre-wrap break-words rounded-2xl bg-amber-50 p-3 text-sm text-amber-950"><strong>Begründung: </strong>{r.bemerkung}</p><p className="text-xs text-zinc-500">Bearbeitet von {r.admin_email || r.admin_user_id}</p>
    </article>)}
    {hasMore && <button className="btn btn-secondary w-full" disabled={busy} onClick={() => load(rows.at(-1)?.id)}>Weitere ältere Einträge laden</button>}
    {busy && <p role="status" className="text-sm text-zinc-500">Protokoll wird geladen…</p>}
  </div>;
}
