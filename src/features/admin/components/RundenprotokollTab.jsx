import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { waitForSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { loadSeasonSettings } from "../../../lib/seasonSettings";
import { exportRoundProtocolPdf } from "../../../lib/pdfExport";
import { groupRoundProtocolDetailed } from "../../../lib/resultsProcessing";
import { buildRoundTitle } from "../../../shared/pdf/editorLayout";
import { getActiveSeason, seasonOrNullFilter } from "../../../lib/seasonScope";



async function withTimeout(promise, timeoutMs = 12000) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
}

function statusInfo(windowRow) {
  if (!windowRow?.start || !windowRow?.ende) {
    return { label: "Nicht gesetzt", className: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  }
  const now = Date.now();
  const start = Date.parse(windowRow.start);
  const end = Date.parse(windowRow.ende);
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) {
    return { label: "Offen", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (Number.isFinite(start) && now < start) {
    return { label: "Zeitfenster gesetzt", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: "Geschlossen", className: "border-rose-200 bg-rose-50 text-rose-700" };
}

export default function RundenprotokollTab() {
  const [roundNumber, setRoundNumber] = useState(1);
  const [entries, setEntries] = useState([]);
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(loadSeasonSettings());
  const requestIdRef = useRef(0);
  const loadAttemptRef = useRef(0);

  const loadData = useCallback(async ({ keepLoading = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const isCurrent = () => requestId === requestIdRef.current;

    if (!keepLoading) setLoading(true);
    setError("");

    try {
      // Session zuverlässig abwarten bevor Query
      await waitForSession(4000);
      if (!isCurrent()) return;

      const activeSeason = getActiveSeason();
      const [{ data: entryData, error: entryError }, { data: windowData, error: windowError }] =
        await withTimeout(
          Promise.all([
            seasonOrNullFilter(supabase.from("verein_ergebnisse").select("*"), activeSeason),
            seasonOrNullFilter(
              supabase.from("zeitfenster").select("wettkampf, start, ende").order("wettkampf", { ascending: true }),
              activeSeason,
            ),
          ]),
          15000,
        );

      if (!isCurrent()) return;
      if (entryError) throw entryError;
      if (windowError) throw windowError;

      setEntries(entryData || []);
      setWindows(windowData || []);
      loadAttemptRef.current = 0;
    } catch (err) {
      if (!isCurrent()) return;
      logError("Rundenergebnisse konnten nicht geladen werden.", err);
      // Genau ein automatischer Retry
      if (loadAttemptRef.current < 1) {
        loadAttemptRef.current += 1;
        window.setTimeout(() => loadData({ keepLoading: true }), 1200);
      } else {
        setError("Rundenergebnisse konnten nicht geladen werden. Bitte Seite neu laden.");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      setSettings(event?.detail || loadSeasonSettings());
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadData({ keepLoading: true });
    };
    const handleRefresh = () => loadData({ keepLoading: true });
    const handleTabActivated = (event) => {
      if (event?.detail?.tab === "protokoll") loadData();
    };

    loadData();

    window.addEventListener("rtliga-settings-updated", handleSettingsUpdate);
    window.addEventListener("rtliga-admin-refresh", handleRefresh);
    window.addEventListener("rtliga-admin-tab-activated", handleTabActivated);
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToTables({
      tables: ["verein_ergebnisse", "zeitfenster"],
      onChange: () => loadData({ keepLoading: true }),
    });

    return () => {
      window.removeEventListener("rtliga-settings-updated", handleSettingsUpdate);
      window.removeEventListener("rtliga-admin-refresh", handleRefresh);
      window.removeEventListener("rtliga-admin-tab-activated", handleTabActivated);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe?.();
    };
  }, [loadData]);

  const roundsWithEntries = useMemo(() => Array.from(new Set((entries || []).map((entry) => Number(entry.wettkampf)).filter(Number.isFinite))).sort((a, b) => a - b), [entries]);
  const grouped = useMemo(() => groupRoundProtocolDetailed(entries, roundNumber, { includeClub: true }), [entries, roundNumber]);
  const groupedEntries = useMemo(() => Object.entries(grouped), [grouped]);
  const classCount = groupedEntries.length;
  const athleteCount = groupedEntries.reduce((sum, [, rows]) => sum + rows.length, 0);
  const currentWindow = windows.find((row) => Number(row.wettkampf) === Number(roundNumber));
  const currentStatus = statusInfo(currentWindow);

  useEffect(() => {
    if (!roundsWithEntries.length) return;
    if (!roundsWithEntries.includes(Number(roundNumber))) {
      setRoundNumber(roundsWithEntries[roundsWithEntries.length - 1]);
    }
  }, [roundNumber, roundsWithEntries]);

  const handleDownload = () => {
    exportRoundProtocolPdf({
      groupedResults: grouped,
      season: settings.activeSeason,
      roundNumber,
      isAdmin: true,
      fileName: `Ergebnisse_Runde${roundNumber}_${settings.activeSeason}_Admin.pdf`,
    });
  };

  if (loading) {
    return <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm">Rundenergebnisse werden geladen…</div>;
  }

  if (error) {
    return <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm text-rose-700 shadow-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-sky-50/60 to-cyan-50/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Rundenprotokoll</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{buildRoundTitle(settings.roundTitle, roundNumber)}</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Die Anzeige bleibt kompakt wie zuvor. Der PDF-Download nutzt weiterhin das Layout aus dem PDF-Editor.
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-zinc-700">Wettkampf</label>
              <select value={roundNumber} onChange={(e) => setRoundNumber(Number(e.target.value))} className="input w-36">
                {Array.from({ length: 9 }, (_, i) => i + 1).map((wk) => (
                  <option key={wk} value={wk} disabled={!roundsWithEntries.includes(wk)}>WK {wk}{roundsWithEntries.includes(wk) ? "" : " · leer"}</option>
                ))}
              </select>
              <button type="button" onClick={() => setRoundNumber(roundsWithEntries[roundsWithEntries.length - 1] || 1)} className="btn btn-secondary">Neueste Runde</button>
              <button type="button" onClick={handleDownload} className="btn btn-secondary">PDF herunterladen</button>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${currentStatus.className}`}>{currentStatus.label}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Saison</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{settings.activeSeason}</p>
            <p className="mt-1 text-sm text-zinc-500">Aktives Wertungsjahr</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Teilnehmer</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{athleteCount}</p>
            <p className="mt-1 text-sm text-zinc-500">Mit Ergebnis in Runde {roundNumber}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Altersklassen</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{classCount}</p>
            <p className="mt-1 text-sm text-zinc-500">Im Protokoll enthalten</p>
          </div>
        </div>
      </div>

      {classCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">Für diesen Wettkampf liegen noch keine Ergebnisse vor.</div>
      ) : null}

      {groupedEntries.map(([klasse, rows]) => (
        <div key={klasse} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">WK {roundNumber}</p>
                <h3 className="mt-2 text-2xl font-semibold text-zinc-900">{klasse}</h3>
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{rows.length} Teilnehmer</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Platz</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Verein</th>
                  {[1, 2, 3, 4, 5, 6].map((serie) => <th key={serie} className="px-3 py-3 text-center">S{serie}</th>)}
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
                    <td className="px-4 py-3">{row.verein || "–"}</td>
                    {[row.s1, row.s2, row.s3, row.s4, row.s5, row.s6].map((value, serieIndex) => <td key={serieIndex} className="px-3 py-3 text-center">{value}</td>)}
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
