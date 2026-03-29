import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";

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

export default function VereinErgebnisseAnzeigen({ verein }) {
  const [ergebnisse, setErgebnisse] = useState([]);

  const fetchErgebnisse = React.useCallback(async () => {
    if (!verein?.vereinsname) return;

    await ensureSupabaseSession();

    const { data, error } = await supabase
      .from("verein_ergebnisse")
      .select("*")
      .eq("verein", verein.vereinsname)
      .order("nachname", { ascending: true })
      .order("vorname", { ascending: true })
      .order("wettkampf", { ascending: true });

    if (error) {
      logError("Ergebnisse konnten nicht geladen werden.");
      return;
    }

    const gruppiert = {};
    (data || []).forEach((eintrag) => {
      const key = `${eintrag.vorname}|${eintrag.nachname}|${eintrag.altersklasse}`;
      if (!gruppiert[key]) {
        gruppiert[key] = {
          vorname: eintrag.vorname,
          nachname: eintrag.nachname,
          altersklasse: eintrag.altersklasse,
          punkte: Array(WK_ANZAHL).fill(0),
        };
      }

      const wkIndex = Number(eintrag.wettkampf) - 1;
      if (wkIndex >= 0 && wkIndex < WK_ANZAHL) {
        gruppiert[key].punkte[wkIndex] = getWkGesamt(eintrag);
      }
    });

    setErgebnisse(Object.values(gruppiert));
  }, [verein?.vereinsname]);

  useEffect(() => {
    if (!verein?.vereinsname) return undefined;

    fetchErgebnisse();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchErgebnisse();
      }
    };

    window.addEventListener("pageshow", fetchErgebnisse);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pageshow", fetchErgebnisse);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchErgebnisse, verein?.vereinsname]);

  useEffect(() => {
    if (!verein?.vereinsname) return undefined;
    return subscribeToTables({ tables: ["verein_ergebnisse"], onChange: fetchErgebnisse });
  }, [fetchErgebnisse, verein?.vereinsname]);

  const berechneBeste6 = (punkte) => {
    const sortiert = [...punkte].sort((a, b) => b - a);
    return sortiert.slice(0, 6).reduce((sum, val) => sum + val, 0);
  };

  const gruppiertNachAltersklasse = useMemo(() => {
    return ergebnisse.reduce((acc, eintrag) => {
      if (!acc[eintrag.altersklasse]) acc[eintrag.altersklasse] = [];
      acc[eintrag.altersklasse].push(eintrag);
      return acc;
    }, {});
  }, [ergebnisse]);

  const altersklassenCount = useMemo(
    () => Object.keys(gruppiertNachAltersklasse).length,
    [gruppiertNachAltersklasse]
  );

  const teilnehmerGesamt = ergebnisse.length;
  const eintraegeGesamt = useMemo(
    () => ergebnisse.reduce((sum, eintrag) => sum + eintrag.punkte.filter((p) => p > 0).length, 0),
    [ergebnisse]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-indigo-50/60 to-sky-50/60 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Vereinsauswertung
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Meine Ergebnisse</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Übersicht aller bereits erfassten Ergebnisse für {verein?.vereinsname}.
              Pro Teilnehmer wird die Summe der besten 6 Wettkämpfe dargestellt.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Teilnehmer
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{teilnehmerGesamt}</p>
              <p className="mt-1 text-sm text-zinc-500">Im Ranking</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Altersklassen
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{altersklassenCount}</p>
              <p className="mt-1 text-sm text-zinc-500">Mit Ergebnissen</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                WK-Einträge
              </p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{eintraegeGesamt}</p>
              <p className="mt-1 text-sm text-zinc-500">Mit Punkten</p>
            </div>
          </div>
        </div>
      </div>

      {Object.keys(gruppiertNachAltersklasse).length === 0 ? (
        <div className={EMPTY_STATE_CLASS}>Noch keine Ergebnisse vorhanden.</div>
      ) : null}

      {Object.entries(gruppiertNachAltersklasse).map(([klasse, teilnehmerListe]) => {
        const sortierteListe = [...teilnehmerListe].sort(
          (a, b) => berechneBeste6(b.punkte) - berechneBeste6(a.punkte)
        );

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

                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                  beste 6 Wettkämpfe gewertet
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {sortierteListe.map((eintrag, idx) => {
                const gesamt = berechneBeste6(eintrag.punkte);

                return (
                  <div
                    key={`${klasse}-${eintrag.vorname}-${eintrag.nachname}-${idx}`}
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
                            {eintrag.vorname} {eintrag.nachname}
                          </h4>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            {klasse}
                          </span>
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                            {verein?.vereinsname}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center">
                        <span
                          className={`rounded-full border px-4 py-2 text-sm font-semibold ${getGesamtBadgeClass(
                            idx
                          )}`}
                        >
                          Gesamt: {gesamt}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Wettkämpfe
                        </p>
                        <p className="text-xs text-zinc-500">Alle 9 Wettkämpfe im Überblick</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
                        {eintrag.punkte.map((pkt, i) => (
                          <div
                            key={i}
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-center"
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              WK{i + 1}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-zinc-900">
                              {pkt || "–"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}