import React, { useEffect, useMemo, useState } from "react";
import { ensureSupabaseSession } from "../../../lib/authReady";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { getActiveSeason, seasonOrNullFilter } from "../../../lib/seasonScope";

const getTeilnehmerBadgeClass = (count) => {
  if (count >= 10) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (count >= 1) return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-500";
};

const getStatusText = (count) => {
  if (count >= 10) return "stark besetzt";
  if (count >= 1) return "Teilnehmer vorhanden";
  return "noch leer";
};

const normalizeAgeClass = (value) => String(value || "").trim();

const VereineTab = ({ onRefreshStats }) => {
  const [vereine, setVereine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offenVereinId, setOffenVereinId] = useState(null);
  const [teilnehmerMap, setTeilnehmerMap] = useState({});
  const [teilnehmerCounts, setTeilnehmerCounts] = useState({});
  const [nameSortOrder, setNameSortOrder] = useState("asc");
  const [ageFilter, setAgeFilter] = useState("Alle");

  const fetchVereine = React.useCallback(async () => {
    setLoading(true);
    try {
      await ensureSupabaseSession({ retries: 4, interval: 120 }).catch(() => null);
      const activeSeason = getActiveSeason();
      const { data, error } = await supabase.from("vereine").select("*").order("vereinsname", { ascending: true });
      if (error) {
        logError("Vereine konnten nicht geladen werden.");
        return;
      }

    const vereinsListe = data || [];
    setVereine(vereinsListe);

    if (vereinsListe.length === 0) {
      setTeilnehmerCounts({});
      return;
    }

    const ids = vereinsListe.map((verein) => verein.id);
    const counts = {};
    const { data: teilnehmerData, error: teilnehmerError } = await seasonOrNullFilter(
      supabase
        .from("verein_teilnehmer")
        .select("id, verein_id")
        .in("verein_id", ids),
      activeSeason
    );

    if (teilnehmerError) {
      logError("Teilnehmerzahlen konnten nicht geladen werden.");
    } else {
      ids.forEach((id) => {
        counts[id] = 0;
      });

      (teilnehmerData || []).forEach((eintrag) => {
        counts[eintrag.verein_id] = (counts[eintrag.verein_id] || 0) + 1;
      });

      setTeilnehmerCounts(counts);
    }

      if (typeof onRefreshStats === "function") onRefreshStats();
    } finally {
      setLoading(false);
    }
  }, [onRefreshStats]);

  useEffect(() => {
    fetchVereine();
  }, [fetchVereine]);

  useEffect(() => {
    const handleAdminRefresh = () => fetchVereine();
    window.addEventListener("rtliga-admin-refresh", handleAdminRefresh);
    const unsubscribe = subscribeToTables({ tables: ["vereine", "verein_teilnehmer"], onChange: fetchVereine });
    return () => {
      window.removeEventListener("rtliga-admin-refresh", handleAdminRefresh);
      unsubscribe?.();
    };
  }, [fetchVereine]);

  const loadTeilnehmer = async (vereinId) => {
    const activeSeason = getActiveSeason();
    const { data, error } = await seasonOrNullFilter(
      supabase
        .from("verein_teilnehmer")
        .select("*")
        .eq("verein_id", vereinId)
        .order("name", { ascending: true })
        .order("vorname", { ascending: true }),
      activeSeason
    );

    if (error) {
      logError("Teilnehmer konnten nicht geladen werden.");
      return [];
    }

    const rows = data || [];
    setTeilnehmerMap((prev) => ({ ...prev, [vereinId]: rows }));
    return rows;
  };

  const toggleTeilnehmer = async (vereinId) => {
    if (offenVereinId === vereinId) {
      setOffenVereinId(null);
      return;
    }

    setOffenVereinId(vereinId);
    setAgeFilter("Alle");
    setNameSortOrder("asc");

    if (!teilnehmerMap[vereinId]) {
      await loadTeilnehmer(vereinId);
    }
  };

  const offenerVerein = vereine.find((verein) => verein.id === offenVereinId) || null;
  const offeneTeilnehmer = teilnehmerMap[offenVereinId] || [];

  const ageOptions = useMemo(() => {
    const values = Array.from(new Set(offeneTeilnehmer.map((t) => normalizeAgeClass(t.altersklasse)).filter(Boolean)));
    return ["Alle", ...values.sort((a, b) => a.localeCompare(b, "de"))];
  }, [offeneTeilnehmer]);

  const sichtbareTeilnehmer = useMemo(() => {
    const filtered = offeneTeilnehmer.filter((teilnehmer) => {
      if (ageFilter === "Alle") return true;
      return normalizeAgeClass(teilnehmer.altersklasse) === ageFilter;
    });

    return [...filtered].sort((a, b) => {
      const aName = String(a.name || "");
      const bName = String(b.name || "");
      const comparison = aName.localeCompare(bName, "de", { sensitivity: "base" });
      if (comparison !== 0) return nameSortOrder === "asc" ? comparison : -comparison;
      return String(a.vorname || "").localeCompare(String(b.vorname || ""), "de", { sensitivity: "base" });
    });
  }, [ageFilter, nameSortOrder, offeneTeilnehmer]);

  if (loading && vereine.length === 0) {
    return <div className="rounded-3xl border border-zinc-200 bg-white px-5 py-10 text-center text-sm text-zinc-500 shadow-sm">Vereine werden geladen…</div>;
  }

  return (
    <div className="space-y-6">
      {offenerVerein ? (
        <div className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-[0_14px_34px_rgba(79,70,229,0.10)]">
          <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Teilnehmerliste</h3>
              <p className="mt-1 text-sm text-zinc-600">
                {sichtbareTeilnehmer.length} von {offeneTeilnehmer.length} gemeldeten Teilnehmern für {offenerVerein.vereinsname}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setNameSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                className="btn-mini"
                title="Nachname sortieren"
              >
                Nachname {nameSortOrder === "asc" ? "A–Z" : "Z–A"}
              </button>
              <label className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
                Altersklasse
                <select
                  value={ageFilter}
                  onChange={(event) => setAgeFilter(event.target.value)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 outline-none"
                >
                  {ageOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">geöffnet</div>
            </div>
          </div>

          {offeneTeilnehmer.length > 0 ? (
            <div className="table-wrap rounded-none border-0 shadow-none">
              <table className="table min-w-[620px]">
                <thead>
                  <tr>
                    <th>Vorname</th>
                    <th>
                      <button type="button" onClick={() => setNameSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))} className="inline-flex items-center gap-2 text-left">
                        <span>Nachname</span>
                        <span className="text-[11px] text-indigo-600">{nameSortOrder === "asc" ? "▲" : "▼"}</span>
                      </button>
                    </th>
                    <th>
                      <div className="flex items-center gap-2">
                        <span>Altersklasse</span>
                        <select
                          value={ageFilter}
                          onChange={(event) => setAgeFilter(event.target.value)}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 outline-none"
                        >
                          {ageOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sichtbareTeilnehmer.map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium text-zinc-900">{t.vorname}</td>
                      <td>{t.name}</td>
                      <td>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
                          {t.altersklasse}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sichtbareTeilnehmer.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-zinc-500">Keine Teilnehmer für diesen Filter gefunden.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-b-3xl border-t border-zinc-200 bg-white px-5 py-8 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-xl text-zinc-500">∅</div>
              <p className="mt-4 text-sm font-medium text-zinc-700">Für diesen Verein sind aktuell noch keine Teilnehmer hinterlegt.</p>
              <p className="mt-1 text-sm text-zinc-500">Die Vereinskarte bleibt trotzdem direkt im Dashboard sichtbar.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Alle Vereine</h2>
          <p className="mt-1 text-sm text-zinc-600">Klick auf einen Verein, um die gemeldeten Teilnehmer anzuzeigen.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-4 py-3 text-sm text-zinc-600 shadow-sm">
          <span className="font-semibold text-zinc-900">{vereine.length}</span> Vereine geladen
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vereine.map((verein) => {
          const istOffen = offenVereinId === verein.id;
          const count = teilnehmerCounts[verein.id] || 0;

          return (
            <div
              key={verein.id}
              className={`overflow-hidden rounded-3xl border bg-white transition-all duration-200 ${
                istOffen
                  ? "border-indigo-200 shadow-[0_14px_34px_rgba(79,70,229,0.10)]"
                  : "border-zinc-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-zinc-300 hover:shadow-[0_12px_28px_rgba(16,24,40,0.08)]"
              }`}
            >
              <button
                type="button"
                className="flex h-full w-full flex-col gap-4 px-5 py-5 text-left transition-colors hover:bg-zinc-50/70 sm:px-6"
                onClick={() => toggleTeilnehmer(verein.id)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm">
                      {(verein.vereinsname || "V").split(" ").slice(0, 2).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xl font-semibold text-zinc-900">{verein.vereinsname}</div>
                      <div className="mt-1 truncate text-sm text-zinc-500">{verein.email || "Keine E-Mail hinterlegt"}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">Verein</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTeilnehmerBadgeClass(count)}`}>{count} Teilnehmer</span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">Status: {getStatusText(count)}</span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-indigo-600">{istOffen ? "Ausblenden" : "Anzeigen"}</span>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-transform duration-200 ${istOffen ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
                </div>
              </button>
            </div>
          );
        })}

        {vereine.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500 xl:col-span-3">
            Es wurden noch keine Vereine gefunden.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VereineTab;
