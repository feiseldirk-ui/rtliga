import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { exportOverallPdf } from "../../../lib/pdfExport";
import { loadSeasonSettings } from "../../../lib/seasonSettings";

const WK_ANZAHL = 9;
const EMPTY_STATE_CLASS =
  "rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500";

function parseNumber(text, key) {
  const match = String(text || "").match(new RegExp(`${key}=(\\d+)`, "i"));
  return match?.[1] ? Number(match[1]) : 0;
}

function getWkGesamt(eintrag) {
  if (eintrag.gesamt != null) return Number(eintrag.gesamt || 0);
  return parseNumber(eintrag.ergebnis, "Gesamt");
}

function getPlatzBadgeClass(index) {
  if (index === 0) return "border-amber-200 bg-amber-100 text-amber-800";
  if (index === 1) return "border-zinc-300 bg-zinc-200 text-zinc-700";
  if (index === 2) return "border-orange-200 bg-orange-100 text-orange-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function getGesamtBadgeClass(index) {
  if (index === 0) return "border-amber-200 bg-amber-50 text-amber-800";
  if (index === 1) return "border-zinc-200 bg-zinc-100 text-zinc-800";
  if (index === 2) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-indigo-200 bg-indigo-50 text-indigo-700";
}

export default function GesamtergebnisseTab() {
  const [alleErgebnisse, setAlleErgebnisse] = useState([]);
  const [zeitfenster, setZeitfenster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const settings = loadSeasonSettings();

  useEffect(() => {
    const ladeDaten = async () => {
      try {
        await ensureSupabaseSession();
        const { data: zfData, error: zfError } = await supabase
          .from("zeitfenster")
          .select("wettkampf, start, ende");

        if (zfError) throw zfError;
        setZeitfenster(zfData || []);

        const { data: ergData, error: ergError } = await supabase
          .from("verein_ergebnisse")
          .select("*");

        if (ergError) throw ergError;
        setAlleErgebnisse(ergData || []);
      } catch (err) {
        logError("Gesamtergebnisse konnten nicht geladen werden.");
        setError("Fehler beim Laden der Daten");
      } finally {
        setLoading(false);
      }
    };

    ladeDaten();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") ladeDaten();
    };

    window.addEventListener("pageshow", ladeDaten);
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToTables({ tables: ["verein_ergebnisse", "zeitfenster"], onChange: ladeDaten });

    return () => {
      window.removeEventListener("pageshow", ladeDaten);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe?.();
    };
  }, []);

  const jetzt = new Date().getTime();
  const geschlosseneWks = zeitfenster
    .filter((z) => z.ende && Date.parse(z.ende) < jetzt)
    .map((z) => Number(z.wettkampf));

  const gruppiert = {};

  alleErgebnisse
    .filter((e) => geschlosseneWks.includes(Number(e.wettkampf)))
    .forEach((e) => {
      const key = `${e.vorname}_${e.nachname}_${e.altersklasse}_${e.verein}`;

      if (!gruppiert[key]) {
        gruppiert[key] = {
          vorname: e.vorname,
          nachname: e.nachname,
          verein: e.verein,
          altersklasse: e.altersklasse,
          punkte: {},
          besteWks: [],
          gesamt: 0,
        };
      }

      gruppiert[key].punkte[`WK${e.wettkampf}`] = getWkGesamt(e);
    });

  Object.values(gruppiert).forEach((person) => {
    const entries = Object.entries(person.punkte).filter(([wk]) =>
      geschlosseneWks.includes(Number(wk.replace("WK", "")))
    );

    entries.sort(([, a], [, b]) => b - a);
    person.besteWks = entries.slice(0, 6).map(([wk]) => wk);
    person.gesamt = entries.slice(0, 6).reduce((sum, [, val]) => sum + val, 0);
  });

  const nachAltersklasse = {};
  Object.values(gruppiert).forEach((p) => {
    if (!nachAltersklasse[p.altersklasse]) nachAltersklasse[p.altersklasse] = [];
    nachAltersklasse[p.altersklasse].push(p);
  });

  const altersklassenCount = useMemo(
    () => Object.keys(nachAltersklasse).length,
    [alleErgebnisse, zeitfenster]
  );

  const teilnehmerCount = useMemo(
    () => Object.values(gruppiert).length,
    [alleErgebnisse, zeitfenster]
  );


  const handlePdfDownload = () => {
    const exportData = {};
    Object.entries(nachAltersklasse).forEach(([klasse, liste]) => {
      exportData[klasse] = [...liste].sort((a, b) => b.gesamt - a.gesamt);
    });

    exportOverallPdf({
      groupedResults: exportData,
      season: settings.activeSeason,
      isAdmin: false,
      fileName: `Gesamtergebnisliste_${settings.activeSeason}_Verein.pdf`,
    });
  };
  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        Lade Ergebnisse…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm text-rose-700 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-indigo-50/60 to-emerald-50/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Gesamtrangliste
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Gesamtergebnisse · Saison {settings.activeSeason}</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Es werden nur Ergebnisse aus bereits geschlossenen Zeitfenstern angezeigt.
              Pro Teilnehmer zählen die besten 6 geschlossenen Wettkämpfe.
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <button type="button" onClick={handlePdfDownload} className="btn btn-secondary">PDF herunterladen</button>
            <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Teilnehmer
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{teilnehmerCount}</p>
              <p className="mt-1 text-sm text-zinc-500">Im Gesamtranking</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Geschlossene WK
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">
                {geschlosseneWks.length}
              </p>
              <p className="mt-1 text-sm text-zinc-500">In der Wertung</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Altersklassen
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{altersklassenCount}</p>
              <p className="mt-1 text-sm text-zinc-500">Mit Platzierung</p>
            </div>
            </div>
          </div>
        </div>
      </div>

      {Object.keys(nachAltersklasse).length === 0 ? (
        <div className={EMPTY_STATE_CLASS}>Keine geschlossenen Ergebnisse vorhanden.</div>
      ) : null}

      {Object.entries(nachAltersklasse).map(([klasse, liste]) => {
        const sortierteListe = [...liste].sort((a, b) => b.gesamt - a.gesamt);

        return (
          <div
            key={klasse}
            className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
          >
            <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-5 py-6 sm:px-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
                    Altersklasse
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-zinc-900">{klasse}</h3>
                  <p className="mt-2 text-sm text-zinc-500">
                    {sortierteListe.length} Teilnehmer in dieser Wertung
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                    nur geschlossene WK
                  </span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                    beste 6 gewertet
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {sortierteListe.map((p, idx) => (
                <div
                  key={`${p.vorname}-${p.nachname}-${idx}`}
                  className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPlatzBadgeClass(
                            idx
                          )}`}
                        >
                          #{idx + 1}
                        </span>

                        <h4 className="text-lg font-semibold text-zinc-900">
                          {p.vorname} {p.nachname}
                        </h4>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                          {klasse}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                          {p.verein}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <span
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${getGesamtBadgeClass(
                          idx
                        )}`}
                      >
                        Gesamt: {p.gesamt}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Geschlossene Wettkämpfe
                      </p>
                      <p className="text-xs text-zinc-500">
                        Streichergebnisse sind ausgegraut
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                      {Array.from({ length: WK_ANZAHL }, (_, i) => {
                        const wkKey = `WK${i + 1}`;
                        const wert = geschlosseneWks.includes(i + 1) ? p.punkte[wkKey] : "";
                        const istStreicher =
                          wert !== undefined && wert !== "" && !p.besteWks.includes(wkKey);

                        return (
                          <div
                            key={wkKey}
                            className={`rounded-2xl border px-3 py-2 text-center ${
                              wert === ""
                                ? "border-zinc-200 bg-zinc-50 text-zinc-400"
                                : istStreicher
                                ? "border-zinc-200 bg-zinc-100 text-zinc-400"
                                : "border-zinc-200 bg-white text-zinc-800"
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              WK{i + 1}
                            </div>
                            <div
                              className={`mt-1 text-sm font-semibold ${
                                istStreicher ? "line-through" : ""
                              }`}
                            >
                              {wert === "" ? "–" : wert}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}