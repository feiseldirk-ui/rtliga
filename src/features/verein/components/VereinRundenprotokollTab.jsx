import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { exportRoundProtocolPdf } from "../../../lib/pdfExport";
import { groupRoundProtocolDetailed } from "../../../lib/resultsProcessing";
import { loadSeasonSettings } from "../../../lib/seasonSettings";
import { buildRoundTitle } from "../../../shared/pdf/editorLayout";

function isClosed(row) {
  return row?.ende && Date.parse(row.ende) < Date.now();
}

export default function VereinRundenprotokollTab({ verein }) {
  const [entries, setEntries] = useState([]);
  const [windows, setWindows] = useState([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(loadSeasonSettings());

  const load = useCallback(async ({ keepLoading = false } = {}) => {
    if (!verein?.vereinsname) return;
    await ensureSupabaseSession().catch(() => null);
    if (!keepLoading) setLoading(true);
    setError("");
    try {
        const [{ data: entryData, error: entryError }, { data: windowData, error: windowError }] = await Promise.all([
          supabase.from("verein_ergebnisse").select("*").eq("verein", verein.vereinsname),
          supabase.from("zeitfenster").select("wettkampf, start, ende").order("wettkampf", { ascending: true }),
        ]);
        if (entryError) throw entryError;
        if (windowError) throw windowError;
        setEntries(entryData || []);
        setWindows(windowData || []);
    } catch {
      logError("Rundenprotokolle konnten nicht geladen werden.");
      setError("Rundenprotokolle konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [verein?.vereinsname]);

  useEffect(() => {
    if (!verein?.vereinsname) return undefined;
    let retryTimer;
    load();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") load({ keepLoading: true });
    };
    const handlePageShow = () => load({ keepLoading: true });
    const handleSettingsUpdate = (event) => setSettings(event?.detail || loadSeasonSettings());

    retryTimer = window.setTimeout(() => {
      load({ keepLoading: true });
    }, 900);

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handlePageShow);
    window.addEventListener("rtliga-settings-updated", handleSettingsUpdate);
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToTables({ tables: ["verein_ergebnisse", "zeitfenster"], onChange: () => load({ keepLoading: true }) });

    return () => {
      window.clearTimeout(retryTimer);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handlePageShow);
      window.removeEventListener("rtliga-settings-updated", handleSettingsUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe?.();
    };
  }, [load, verein?.vereinsname]);

  const closedRounds = useMemo(() => windows.filter(isClosed).map((row) => Number(row.wettkampf)), [windows]);
  const closedRoundsWithEntries = useMemo(() => closedRounds.filter((wk) => entries.some((entry) => Number(entry.wettkampf) === Number(wk))), [closedRounds, entries]);
  const grouped = useMemo(() => groupRoundProtocolDetailed(entries, roundNumber, { includeClub: true }), [entries, roundNumber]);
  const totalParticipants = useMemo(() => Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0), [grouped]);

  useEffect(() => {
    if (!closedRoundsWithEntries.length) return;
    if (!closedRoundsWithEntries.includes(Number(roundNumber))) {
      setRoundNumber(closedRoundsWithEntries[closedRoundsWithEntries.length - 1]);
    }
  }, [closedRoundsWithEntries, roundNumber]);

  const handleDownload = () => {
    exportRoundProtocolPdf({
      groupedResults: grouped,
      season: settings.activeSeason,
      roundNumber,
      isAdmin: true,
      fileName: `Ergebnisse_Runde${roundNumber}_${settings.activeSeason}_Verein.pdf`,
    });
  };

  if (loading) return <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm">Rundenprotokolle werden geladen…</div>;
  if (error) return <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm text-rose-700 shadow-sm">{error}</div>;
  if (closedRounds.length === 0) return <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">Aktuell gibt es noch keine geschlossenen Wettkämpfe.</div>;
  if (closedRoundsWithEntries.length === 0) return <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">Es gibt bereits geschlossene Wettkämpfe, aber für euren Verein noch keine abgeschlossenen Protokolle.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-indigo-50/60 to-sky-50/60 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Rundenprotokolle</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{buildRoundTitle(settings.roundTitle, roundNumber)}</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">Angezeigt werden nur bereits geschlossene Runden. Der PDF-Download enthält Serien 1–6 sowie LL, SL und Gesamtergebnis.</p>
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
            <select value={roundNumber} onChange={(e) => setRoundNumber(Number(e.target.value))} className="input w-full sm:w-44">
              {closedRounds.map((wk) => <option key={wk} value={wk} disabled={!closedRoundsWithEntries.includes(wk)}>WK {wk}{closedRoundsWithEntries.includes(wk) ? "" : " · ohne Eintrag"}</option>)}
            </select>
            <button type="button" onClick={() => setRoundNumber(closedRoundsWithEntries[closedRoundsWithEntries.length - 1] || 1)} className="btn btn-secondary w-full sm:w-auto">Neueste Runde</button>
            <button type="button" onClick={handleDownload} className="btn btn-secondary w-full sm:w-auto">PDF herunterladen</button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Geschlossene WK</p><p className="mt-2 text-xl font-semibold text-zinc-900">{closedRoundsWithEntries.length}</p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktive Runde</p><p className="mt-2 text-xl font-semibold text-zinc-900">WK {roundNumber}</p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Teilnehmer</p><p className="mt-2 text-xl font-semibold text-zinc-900">{totalParticipants}</p></div>
        </div>
      </div>

      {Object.entries(grouped).map(([klasse, rows]) => (
        <div key={klasse} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">WK {roundNumber}</p>
                <h3 className="mt-2 text-2xl font-semibold text-zinc-900">{klasse}</h3>
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{rows.length} Teilnehmer</div>
            </div>
          </div>
          <div className="space-y-4 p-4 sm:p-5 md:hidden">
            {rows.map((row, idx) => (
              <div key={`${klasse}-${row.vorname}-${row.nachname}-${idx}-card`} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Platz {idx + 1}</p>
                    <h4 className="mt-1 text-base font-semibold text-zinc-900">{row.vorname} {row.nachname}</h4>
                    <p className="mt-1 text-sm text-zinc-600">{row.verein || verein?.vereinsname || "–"}</p>
                  </div>
                  <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">{row.gesamt}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[["S1", row.s1],["S2", row.s2],["S3", row.s3],["S4", row.s4],["S5", row.s5],["S6", row.s6],["LL", row.ll],["SL", row.sl],["Ges", row.gesamt]].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-2.5 py-2 text-center">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Platz</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Verein</th>
                  {[1,2,3,4,5,6].map((serie) => <th key={serie} className="px-3 py-3 text-center">S{serie}</th>)}
                  <th className="px-3 py-3 text-center">LL</th>
                  <th className="px-3 py-3 text-center">SL</th>
                  <th className="px-3 py-3 text-center">Ges.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${klasse}-${row.vorname}-${row.nachname}-${idx}`} className="border-t border-zinc-200">
                    <td className="px-4 py-3 font-semibold text-zinc-900">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{row.vorname} {row.nachname}</td>
                    <td className="px-4 py-3 text-zinc-700">{row.verein || verein?.vereinsname || "–"}</td>
                    {[row.s1,row.s2,row.s3,row.s4,row.s5,row.s6].map((value, serieIndex) => <td key={serieIndex} className="px-3 py-3 text-center">{value}</td>)}
                    <td className="px-3 py-3 text-center font-semibold">{row.ll}</td>
                    <td className="px-3 py-3 text-center font-semibold">{row.sl}</td>
                    <td className="px-3 py-3 text-center font-semibold text-zinc-900">{row.gesamt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
