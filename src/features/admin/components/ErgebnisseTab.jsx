import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import * as XLSX from "xlsx";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { exportOverallPdf } from "../../../lib/pdfExport";
import { loadSeasonSettings } from "../../../lib/seasonSettings";
import { getActiveSeason, seasonOrNullFilter } from "../../../lib/seasonScope";

const WK_ANZAHL = 9;

function parseNumber(text, key) {
  const match = String(text || "").match(new RegExp(`${key}=(\\d+)`, "i"));
  return match?.[1] ? Number(match[1]) : 0;
}

function getWkGesamt(eintrag) {
  if (eintrag.gesamt != null) return Number(eintrag.gesamt || 0);
  return parseNumber(eintrag.ergebnis, "Gesamt");
}

const getPlatzBadgeClass = (index) => {
  if (index === 0) return "bg-amber-100 text-amber-800 border-amber-200";
  if (index === 1) return "bg-zinc-200 text-zinc-700 border-zinc-300";
  if (index === 2) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-zinc-100 text-zinc-600 border-zinc-200";
};

const getGesamtBadgeClass = (index) => {
  if (index === 0) return "bg-amber-50 text-amber-800 border-amber-200";
  if (index === 1) return "bg-zinc-100 text-zinc-800 border-zinc-200";
  if (index === 2) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-indigo-50 text-indigo-700 border-indigo-200";
};

const ErgebnisseTab = () => {
  const [gruppierteErgebnisse, setGruppierteErgebnisse] = useState({});
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [rohEintraege, setRohEintraege] = useState(0);

  const ladeUndVerarbeiteErgebnisse = React.useCallback(async () => {
    await ensureSupabaseSession();
    const activeSeason = getActiveSeason();
    const { data, error } = await seasonOrNullFilter(supabase.from("verein_ergebnisse").select("*"), activeSeason);

    if (error) {
      logError("Daten konnten nicht geladen werden.");
      return;
    }

    const eintraege = data || [];
    setRohEintraege(eintraege.length);

    const teilnehmerMap = {};

    eintraege.forEach((eintrag) => {
      const key = `${eintrag.vorname} ${eintrag.nachname} ${eintrag.altersklasse}`;

      if (!teilnehmerMap[key]) {
        teilnehmerMap[key] = {
          vorname: eintrag.vorname,
          nachname: eintrag.nachname,
          altersklasse: eintrag.altersklasse,
          verein: eintrag.verein,
          punkte: Array(WK_ANZAHL).fill(0),
        };
      }

      const wkIndex = Number(eintrag.wettkampf) - 1;
      const gesamt = getWkGesamt(eintrag);

      if (!Number.isNaN(wkIndex) && wkIndex >= 0 && wkIndex < WK_ANZAHL) {
        teilnehmerMap[key].punkte[wkIndex] = gesamt;
      }
    });

    const teilnehmerListe = Object.values(teilnehmerMap);

    const gruppiert = {};
    teilnehmerListe.forEach((t) => {
      if (!gruppiert[t.altersklasse]) gruppiert[t.altersklasse] = [];
      const beste6 = berechneBeste6(t.punkte);

      gruppiert[t.altersklasse].push({
        ...t,
        gesamt: beste6.summe,
        streicher: beste6.streicher,
      });
    });

    Object.keys(gruppiert).forEach((klasse) => {
      gruppiert[klasse].sort((a, b) => b.gesamt - a.gesamt);
    });

    setGruppierteErgebnisse(gruppiert);
  }, []);

  useEffect(() => {
    ladeUndVerarbeiteErgebnisse();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        ladeUndVerarbeiteErgebnisse();
      }
    };

    window.addEventListener("pageshow", ladeUndVerarbeiteErgebnisse);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pageshow", ladeUndVerarbeiteErgebnisse);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ladeUndVerarbeiteErgebnisse]);

  useEffect(() => subscribeToTables({ tables: ["verein_ergebnisse"], onChange: ladeUndVerarbeiteErgebnisse }), [ladeUndVerarbeiteErgebnisse]);

  const berechneBeste6 = (punkte) => {
    const sortiert = [...punkte].sort((a, b) => b - a);
    const summe = sortiert.slice(0, 6).reduce((acc, val) => acc + val, 0);
    const streicher = [...punkte]
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => a.val - b.val)
      .slice(0, 3)
      .map((e) => e.idx);

    return { summe, streicher };
  };

  const handleExport = () => {
    if (exportFormat === "xlsx") {
      const wb = XLSX.utils.book_new();

      Object.entries(gruppierteErgebnisse).forEach(([klasse, teilnehmer]) => {
        const daten = teilnehmer.map((t) => {
          const wkDaten = {};
          t.punkte.forEach((pkt, i) => {
            wkDaten[`WK${i + 1}`] = pkt > 0 ? pkt : "";
          });

          return {
            Vorname: t.vorname,
            Nachname: t.nachname,
            Verein: t.verein,
            ...wkDaten,
            Gesamt: t.gesamt,
          };
        });

        const ws = XLSX.utils.json_to_sheet(daten);
        XLSX.utils.book_append_sheet(wb, ws, klasse);
      });

      XLSX.writeFile(wb, "Ergebnisse.xlsx");
      return;
    }

    if (exportFormat === "csv") {
      const alleDaten = [];

      Object.entries(gruppierteErgebnisse).forEach(([klasse, teilnehmer]) => {
        teilnehmer.forEach((t) => {
          const wkDaten = {};
          t.punkte.forEach((pkt, i) => {
            wkDaten[`WK${i + 1}`] = pkt > 0 ? pkt : "";
          });

          alleDaten.push({
            Altersklasse: klasse,
            Vorname: t.vorname,
            Nachname: t.nachname,
            Verein: t.verein,
            ...wkDaten,
            Gesamt: t.gesamt,
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(alleDaten);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "Ergebnisse.csv";
      link.click();
      return;
    }

    if (exportFormat === "pdf") {
      const settings = loadSeasonSettings();
      exportOverallPdf({
        groupedResults: gruppierteErgebnisse,
        season: settings.activeSeason,
        isAdmin: true,
        fileName: `Gesamtergebnisliste_${settings.activeSeason}_Admin.pdf`,
      });
    }
  };

  const altersklassenCount = useMemo(
    () => Object.keys(gruppierteErgebnisse).length,
    [gruppierteErgebnisse]
  );

  const teilnehmerGesamt = useMemo(
    () =>
      Object.values(gruppierteErgebnisse).reduce(
        (summe, gruppe) => summe + gruppe.length,
        0
      ),
    [gruppierteErgebnisse]
  );

  const exportLabel = exportFormat.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-amber-50/60 to-orange-50/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">
              Ligaauswertung
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Ergebnisse</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600 sm:text-base">
              Hier werden alle Wettkampfergebnisse pro Altersklasse zusammengeführt.
              Gewertet werden automatisch die besten 6 Wettkämpfe je Teilnehmer.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px] xl:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Teilnehmer
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {teilnehmerGesamt}
              </p>
              <p className="mt-1 text-sm text-zinc-500">In der Wertung</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Altersklassen
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {altersklassenCount}
              </p>
              <p className="mt-1 text-sm text-zinc-500">Mit Einträgen</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Ergebniseinträge
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {rohEintraege}
              </p>
              <p className="mt-1 text-sm text-zinc-500">Gespeicherte Datensätze</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Export
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {exportLabel}
              </p>
              <p className="mt-1 text-sm text-zinc-500">Aktives Format</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-zinc-900">Export & Übersicht</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Ergebnisse können gesammelt als XLSX, CSV oder PDF exportiert werden.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="input min-w-[150px] py-2.5"
            >
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>

            <button onClick={handleExport} className="btn btn-secondary">
              Exportieren
            </button>
          </div>
        </div>
      </div>

      {Object.entries(gruppierteErgebnisse).length === 0 && (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">
          Noch keine Ergebnisse vorhanden.
        </div>
      )}

      {Object.entries(gruppierteErgebnisse).map(([klasse, teilnehmer]) => (
        <div
          key={klasse}
          className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
        >
          <div className="border-b border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Altersklasse
                  </span>
                  <h3 className="text-xl font-semibold text-zinc-900">{klasse}</h3>
                </div>

                <p className="mt-2 text-sm text-zinc-500">
                  {teilnehmer.length} Teilnehmer in dieser Wertung
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                  beste 6 gewertet
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                  3 Streichergebnisse markiert
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            {teilnehmer.map((t, idx) => (
              <div
                key={`${klasse}-${t.vorname}-${t.nachname}-${idx}`}
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
                        {t.vorname} {t.nachname}
                      </h4>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                        {t.verein}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                        {klasse}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <span
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${getGesamtBadgeClass(
                        idx
                      )}`}
                    >
                      Gesamt: {t.gesamt}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Wettkämpfe
                    </p>
                    <p className="text-xs text-zinc-500">
                      Streichergebnisse sind ausgegraut
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                    {t.punkte.map((pkt, i) => {
                      const istStreicher = t.streicher.includes(i);

                      return (
                        <div
                          key={i}
                          className={`rounded-2xl border px-3 py-2 text-center transition-colors ${
                            istStreicher
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
                            {pkt > 0 ? pkt : "–"}
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
      ))}
    </div>
  );
};

export default ErgebnisseTab;