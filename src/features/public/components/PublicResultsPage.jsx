import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import { exportOverallPdf, exportRoundProtocolPdf } from "../../../lib/pdfExport";
import {
  groupOverallResults,
  groupRoundProtocolDetailed,
} from "../../../lib/resultsProcessing";
import {
  getPublicRoundNumbers,
  getPublicSeason,
  getRoundClosedAt,
  normalizePublicResults,
} from "../../../lib/publicResults";
import BrandMark from "../../../shared/ui/BrandMark";

const WK_ANZAHL = 9;

function withTimeout(promise, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getPlaceClass(index) {
  if (index === 0) return "border-amber-200 bg-amber-100 text-amber-800";
  if (index === 1) return "border-zinc-300 bg-zinc-200 text-zinc-700";
  if (index === 2) return "border-orange-200 bg-orange-100 text-orange-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>
    </svg>
  );
}

function EmptyState({ children }) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-white px-5 py-14 text-center text-sm text-zinc-500 shadow-sm">
      {children}
    </div>
  );
}

function RoundClass({ klasse, rows, roundNumber }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-gradient-to-r from-white to-emerald-50/50 px-5 py-5 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">WK {roundNumber}</p>
          <h3 className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl">{klasse}</h3>
        </div>
        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
          {rows.length} Teilnehmer
        </span>
      </header>

      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row, index) => (
          <article key={`${row.verein}-${row.vorname}-${row.nachname}-${index}`} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPlaceClass(index)}`}>Platz {index + 1}</span>
                <h4 className="mt-2 font-semibold text-zinc-900">{row.vorname} {row.nachname}</h4>
                <p className="mt-1 text-sm text-zinc-600">{row.verein || "–"}</p>
              </div>
              <span className="rounded-xl bg-emerald-100 px-3 py-2 text-base font-bold text-emerald-800">{row.gesamt}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[["S1", row.s1], ["S2", row.s2], ["S3", row.s3], ["S4", row.s4], ["S5", row.s5], ["S6", row.s6], ["LL", row.ll], ["SL", row.sl], ["Ges", row.gesamt]].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left">Platz</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Verein</th>
              {[1, 2, 3, 4, 5, 6].map((serie) => <th key={serie} className="px-3 py-3 text-center">S{serie}</th>)}
              <th className="px-3 py-3 text-center">LL</th>
              <th className="px-3 py-3 text-center">SL</th>
              <th className="px-3 py-3 text-center">Ges.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.verein}-${row.vorname}-${row.nachname}-${index}`} className="border-t border-zinc-200">
                <td className="px-4 py-3"><span className={`inline-flex min-w-8 justify-center rounded-full border px-2 py-1 text-xs font-semibold ${getPlaceClass(index)}`}>{index + 1}</span></td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900">{row.vorname} {row.nachname}</td>
                <td className="px-4 py-3 text-zinc-600">{row.verein || "–"}</td>
                {[row.s1, row.s2, row.s3, row.s4, row.s5, row.s6].map((value, serieIndex) => <td key={serieIndex} className="px-3 py-3 text-center">{value}</td>)}
                <td className="px-3 py-3 text-center font-semibold">{row.ll}</td>
                <td className="px-3 py-3 text-center font-semibold">{row.sl}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-700">{row.gesamt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PublicRounds({ entries, rounds, season }) {
  const [roundNumber, setRoundNumber] = useState(rounds.at(-1) || 1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (rounds.length && !rounds.includes(Number(roundNumber))) setRoundNumber(rounds.at(-1));
  }, [roundNumber, rounds]);

  const grouped = useMemo(
    () => groupRoundProtocolDetailed(entries, roundNumber, { includeClub: true }),
    [entries, roundNumber],
  );
  const participantCount = useMemo(
    () => Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0),
    [grouped],
  );
  const closedAt = formatDate(getRoundClosedAt(entries, roundNumber));

  const download = async () => {
    if (!participantCount || exporting) return;
    setExporting(true);
    try {
      await exportRoundProtocolPdf({
        groupedResults: grouped,
        season,
        roundNumber,
        isAdmin: true,
        fileName: `RTLiga_Ergebnisse_WK${roundNumber}_${season}.pdf`,
      });
    } finally {
      setExporting(false);
    }
  };

  if (!rounds.length) return <EmptyState>Für die Saison {season} sind noch keine geschlossenen Ergebnisse veröffentlicht.</EmptyState>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-white via-emerald-50/70 to-sky-50/60 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Wettkampfrunden</p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-900">Ergebnisse WK {roundNumber}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Sichtbar sind nur Runden, deren gültiges Zeitfenster vollständig beendet ist.
              {closedAt ? ` WK ${roundNumber} wurde am ${closedAt} Uhr geschlossen.` : ""}
            </p>
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            <select value={roundNumber} onChange={(event) => setRoundNumber(Number(event.target.value))} className="input sm:w-44" aria-label="Wettkampfrunde auswählen">
              {rounds.map((round) => <option key={round} value={round}>WK {round}</option>)}
            </select>
            <button type="button" onClick={() => setRoundNumber(rounds.at(-1))} className="btn btn-secondary">Neueste Runde</button>
            <button type="button" onClick={download} disabled={exporting} className="btn border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500">
              <DownloadIcon /> {exporting ? "PDF wird erstellt…" : "PDF herunterladen"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[["Veröffentlichte WK", rounds.length], ["Gewählte Runde", `WK ${roundNumber}`], ["Teilnehmer", participantCount]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {Object.entries(grouped).map(([klasse, rows]) => <RoundClass key={klasse} klasse={klasse} rows={rows} roundNumber={roundNumber} />)}
    </div>
  );
}

function PublicOverall({ entries, rounds, season }) {
  const [exporting, setExporting] = useState(false);
  const grouped = useMemo(
    () => groupOverallResults(entries, rounds, { includeClub: true }),
    [entries, rounds],
  );
  const participantCount = Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0);

  const download = async () => {
    if (!participantCount || exporting) return;
    setExporting(true);
    try {
      await exportOverallPdf({
        groupedResults: grouped,
        season,
        fileName: `RTLiga_Gesamtliste_${season}.pdf`,
      });
    } finally {
      setExporting(false);
    }
  };

  if (!rounds.length) return <EmptyState>Für die Saison {season} gibt es noch keine Gesamtliste aus geschlossenen Runden.</EmptyState>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-blue-200 bg-gradient-to-r from-white via-blue-50/70 to-emerald-50/50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Aktuelle Gesamtliste</p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-900">Gesamtwertung · Saison {season}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Pro Teilnehmer zählen die besten sechs Ergebnisse aus den bereits geschlossenen Wettkampfrunden.
            </p>
          </div>
          <button type="button" onClick={download} disabled={exporting} className="btn border border-blue-600 bg-blue-600 text-white hover:bg-blue-500">
            <DownloadIcon /> {exporting ? "PDF wird erstellt…" : "Gesamtliste als PDF"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[["Teilnehmer", participantCount], ["Geschlossene WK", rounds.length], ["Altersklassen", Object.keys(grouped).length]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {Object.entries(grouped).map(([klasse, rows]) => (
        <section key={klasse} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-gradient-to-r from-white to-blue-50/50 px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Altersklasse</p>
              <h3 className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl">{klasse}</h3>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">Beste 6 gewertet</span>
          </header>
          <div className="space-y-3 p-4 sm:p-5">
            {rows.map((person, index) => (
              <article key={`${person.verein}-${person.vorname}-${person.nachname}`} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getPlaceClass(index)}`}>#{index + 1}</span>
                      <h4 className="font-semibold text-zinc-900">{person.vorname} {person.nachname}</h4>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">{person.verein || "–"}</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800">Gesamt: {person.gesamt}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                  {Array.from({ length: WK_ANZAHL }, (_, index) => {
                    const key = `WK${index + 1}`;
                    const closed = rounds.includes(index + 1);
                    const value = closed ? person.punkte[key] : "";
                    const discarded = value !== "" && !person.besteWks.includes(key);
                    return (
                      <div key={key} className={`rounded-xl border px-2 py-2 text-center ${value === "" ? "border-zinc-200 bg-white text-zinc-400" : discarded ? "border-zinc-200 bg-zinc-100 text-zinc-400" : "border-blue-200 bg-white text-zinc-900"}`}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{key}</div>
                        <div className={`mt-1 text-sm font-semibold ${discarded ? "line-through" : ""}`}>{value === "" ? "–" : value}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function PublicResultsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("ansicht");
  const view = requestedView === "gesamt" ? "gesamt" : "runden";
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const requestedSeason = String(new Date().getFullYear());

  const load = useCallback(async ({ keepLoading = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!keepLoading) setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await withTimeout(
        supabase.rpc("get_public_closed_results", { p_saison: requestedSeason }),
      );
      if (requestId !== requestIdRef.current) return;
      if (queryError) throw queryError;
      setEntries(normalizePublicResults(data || []));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      logError("Öffentliche Ergebnisse konnten nicht geladen werden.", loadError);
      setError("Die öffentlichen Ergebnisse konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [requestedSeason]);

  useEffect(() => {
    load();
    const handlePageShow = () => load({ keepLoading: true });
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load({ keepLoading: true });
    };
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const rounds = useMemo(() => getPublicRoundNumbers(entries), [entries]);
  const season = getPublicSeason(entries, requestedSeason);

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-white/80 bg-white/95 px-4 py-4 shadow-sm backdrop-blur sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
              <BrandMark className="h-12 w-32" />
              <div className="hidden sm:block">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Öffentlicher Bereich</p>
                <p className="font-bold text-zinc-900">RTLiga Ergebnisse</p>
              </div>
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSearchParams({ ansicht: "runden" })} className={`tab-btn ${view === "runden" ? "tab-btn-active" : ""}`}>Wettkampfrunden</button>
              <button type="button" onClick={() => setSearchParams({ ansicht: "gesamt" })} className={`tab-btn ${view === "gesamt" ? "tab-btn-active" : ""}`}>Gesamtliste</button>
              <button type="button" onClick={() => navigate("/")} className="btn btn-secondary">Zur Startseite</button>
            </div>
          </div>
        </header>

        <section className="mb-6 mt-6 px-1 sm:px-2">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600">Ohne Anmeldung zugänglich</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">Öffentliche Ergebnisse</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-base">
            Hier erscheinen ausschließlich Ergebnisse aus geschlossenen Wettkampfrunden. Laufende oder zukünftige Runden werden nicht veröffentlicht.
          </p>
        </section>

        {loading ? <EmptyState>Öffentliche Ergebnisse werden geladen…</EmptyState> : null}
        {!loading && error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm text-rose-700">
            <p>{error}</p>
            <button type="button" onClick={() => load()} className="btn btn-secondary mt-4">Erneut versuchen</button>
          </div>
        ) : null}
        {!loading && !error && view === "runden" ? <PublicRounds entries={entries} rounds={rounds} season={season} /> : null}
        {!loading && !error && view === "gesamt" ? <PublicOverall entries={entries} rounds={rounds} season={season} /> : null}
      </div>
    </main>
  );
}
