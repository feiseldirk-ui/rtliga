import React, { useEffect, useMemo, useRef, useState } from "react";
import { waitForSession } from "../../../lib/authReady";
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
const STANDARD_AGE_CLASSES = ["Schüler", "Jugend", "Junioren", "Damen", "Herren", "Altersklasse"];

function withTimeout(promise, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

const VereineTab = ({ onRefreshStats }) => {
  const [vereine, setVereine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offenVereinId, setOffenVereinId] = useState(null);
  const [teilnehmerMap, setTeilnehmerMap] = useState({});
  const [teilnehmerCounts, setTeilnehmerCounts] = useState({});
  const [nameSortOrder, setNameSortOrder] = useState("asc");
  const [ageFilter, setAgeFilter] = useState("Alle");
  const [loadError, setLoadError] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const [editForm, setEditForm] = useState({ vorname: "", name: "", altersklasse: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");
  const requestIdRef = useRef(0);

  const fetchVereine = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadError("");

    try {
      const session = await waitForSession(4000);
      if (requestId !== requestIdRef.current) return;
      if (!session) throw new Error("session-timeout");

      const activeSeason = getActiveSeason();
      const { data, error } = await withTimeout(
        supabase.from("vereine").select("*").order("vereinsname", { ascending: true }),
      );
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;

      const vereinsListe = data || [];
      setVereine(vereinsListe);

      if (vereinsListe.length === 0) {
        setTeilnehmerCounts({});
        return;
      }

      const ids = vereinsListe.map((verein) => verein.id);
      const counts = {};
      const { data: teilnehmerData, error: teilnehmerError } = await withTimeout(
        seasonOrNullFilter(
          supabase
            .from("verein_teilnehmer")
            .select("id, verein_id")
            .in("verein_id", ids),
          activeSeason,
        ),
      );
      if (requestId !== requestIdRef.current) return;
      if (teilnehmerError) throw teilnehmerError;

      ids.forEach((id) => {
        counts[id] = 0;
      });
      (teilnehmerData || []).forEach((eintrag) => {
        counts[eintrag.verein_id] = (counts[eintrag.verein_id] || 0) + 1;
      });

      setTeilnehmerCounts(counts);
      if (typeof onRefreshStats === "function") onRefreshStats();
    } catch {
      if (requestId !== requestIdRef.current) return;
      logError("Vereine konnten nicht geladen werden.");
      setLoadError("Vereine konnten nicht geladen werden. Bitte den Bereich erneut öffnen.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [onRefreshStats]);

  useEffect(() => {
    fetchVereine();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchVereine]);

  useEffect(() => {
    const handleAdminRefresh = () => fetchVereine();
    window.addEventListener("rtliga-admin-refresh", handleAdminRefresh);
    const unsubscribe = subscribeToTables({ tables: ["vereine", "verein_teilnehmer", "verein_ergebnisse"], onChange: fetchVereine });
    return () => {
      window.removeEventListener("rtliga-admin-refresh", handleAdminRefresh);
      unsubscribe?.();
    };
  }, [fetchVereine]);

  const loadTeilnehmer = async (vereinId) => {
    const session = await waitForSession(4000);
    if (!session) {
      logError("Teilnehmer konnten nicht geladen werden.");
      return [];
    }

    const activeSeason = getActiveSeason();
    const { data, error } = await withTimeout(
      seasonOrNullFilter(
        supabase
          .from("verein_teilnehmer")
          .select("*")
          .eq("verein_id", vereinId)
          .order("name", { ascending: true })
          .order("vorname", { ascending: true }),
        activeSeason,
      ),
    ).catch(() => ({ data: null, error: new Error("timeout") }));

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
      setEditingParticipantId(null);
      return;
    }

    setOffenVereinId(vereinId);
    setAgeFilter("Alle");
    setNameSortOrder("asc");
    setEditingParticipantId(null);
    setEditMessage("");
    setEditError("");

    if (!teilnehmerMap[vereinId]) {
      await loadTeilnehmer(vereinId);
    }
  };

  const beginEditParticipant = (teilnehmer) => {
    setEditingParticipantId(teilnehmer.id);
    setEditForm({
      vorname: teilnehmer.vorname || "",
      name: teilnehmer.name || "",
      altersklasse: teilnehmer.altersklasse || "",
    });
    setEditMessage("");
    setEditError("");
  };

  const cancelEditParticipant = () => {
    setEditingParticipantId(null);
    setEditForm({ vorname: "", name: "", altersklasse: "" });
    setEditError("");
  };

  const saveParticipantCorrection = async (teilnehmer) => {
    const vorname = editForm.vorname.trim();
    const name = editForm.name.trim();
    const altersklasse = editForm.altersklasse.trim();

    if (!vorname || !name || !altersklasse) {
      setEditError("Vorname, Nachname und Altersklasse müssen ausgefüllt sein.");
      return;
    }

    const unchanged =
      vorname === String(teilnehmer.vorname || "").trim() &&
      name === String(teilnehmer.name || "").trim() &&
      altersklasse === String(teilnehmer.altersklasse || "").trim();

    if (unchanged) {
      setEditingParticipantId(null);
      return;
    }

    const confirmed = window.confirm(
      `Teilnehmerdaten wirklich ändern?\n\n${teilnehmer.vorname} ${teilnehmer.name} (${teilnehmer.altersklasse || "ohne Klasse"})\n→\n${vorname} ${name} (${altersklasse})\n\nVorhandene Ergebnisse bleiben bestehen und werden demselben Teilnehmer zugeordnet.`
    );

    if (!confirmed) return;

    setEditSaving(true);
    setEditError("");
    setEditMessage("");

    try {
      const { error } = await supabase.rpc("admin_update_teilnehmer_stammdaten", {
        p_teilnehmer_id: teilnehmer.id,
        p_vorname: vorname,
        p_nachname: name,
        p_altersklasse: altersklasse,
      });

      if (error) throw error;

      await loadTeilnehmer(teilnehmer.verein_id);
      setEditingParticipantId(null);
      setEditForm({ vorname: "", name: "", altersklasse: "" });
      setEditMessage(`Teilnehmerdaten von ${vorname} ${name} wurden aktualisiert. Vorhandene Ergebnisse bleiben zugeordnet.`);
      if (typeof onRefreshStats === "function") onRefreshStats();
      window.dispatchEvent(new CustomEvent("rtliga-admin-refresh"));
    } catch (error) {
      console.error("Teilnehmerkorrektur fehlgeschlagen:", error);
      setEditError("Die Teilnehmerdaten konnten nicht gespeichert werden. Bitte Admin-Sitzung prüfen und erneut versuchen.");
    } finally {
      setEditSaving(false);
    }
  };

  const offenerVerein = vereine.find((verein) => verein.id === offenVereinId) || null;
  const offeneTeilnehmer = useMemo(
    () => teilnehmerMap[offenVereinId] || [],
    [offenVereinId, teilnehmerMap],
  );

  const ageOptions = useMemo(() => {
    const values = Array.from(new Set(offeneTeilnehmer.map((t) => normalizeAgeClass(t.altersklasse)).filter(Boolean)));
    return ["Alle", ...values.sort((a, b) => a.localeCompare(b, "de"))];
  }, [offeneTeilnehmer]);

  const editAgeOptions = useMemo(() => {
    const values = new Set(STANDARD_AGE_CLASSES);
    offeneTeilnehmer.forEach((teilnehmer) => {
      const value = normalizeAgeClass(teilnehmer.altersklasse);
      if (value) values.add(value);
    });
    if (editForm.altersklasse) values.add(editForm.altersklasse);
    return Array.from(values);
  }, [editForm.altersklasse, offeneTeilnehmer]);

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

  if (loadError && vereine.length === 0) {
    return <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-sm text-rose-700 shadow-sm">{loadError}</div>;
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
              <button type="button" onClick={() => setNameSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))} className="btn-mini" title="Nachname sortieren">
                Nachname {nameSortOrder === "asc" ? "A–Z" : "Z–A"}
              </button>
              <label className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
                Altersklasse
                <select value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 outline-none">
                  {ageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">geöffnet</div>
            </div>
          </div>

          {editMessage ? (
            <div className="mx-5 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{editMessage}</div>
          ) : null}
          {editError ? (
            <div className="mx-5 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{editError}</div>
          ) : null}

          {offeneTeilnehmer.length > 0 ? (
            <div className="table-wrap rounded-none border-0 shadow-none">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Vorname</th>
                    <th>
                      <button type="button" onClick={() => setNameSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))} className="inline-flex items-center gap-2 text-left">
                        <span>Nachname</span>
                        <span className="text-[11px] text-indigo-600">{nameSortOrder === "asc" ? "▲" : "▼"}</span>
                      </button>
                    </th>
                    <th>Altersklasse</th>
                    <th className="text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {sichtbareTeilnehmer.map((t) => {
                    const editing = editingParticipantId === t.id;
                    return (
                      <tr key={t.id}>
                        <td className="font-medium text-zinc-900">
                          {editing ? (
                            <input className="input min-w-[150px]" value={editForm.vorname} onChange={(event) => setEditForm((prev) => ({ ...prev, vorname: event.target.value }))} />
                          ) : t.vorname}
                        </td>
                        <td>
                          {editing ? (
                            <input className="input min-w-[170px]" value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
                          ) : t.name}
                        </td>
                        <td>
                          {editing ? (
                            <select className="input min-w-[170px]" value={editForm.altersklasse} onChange={(event) => setEditForm((prev) => ({ ...prev, altersklasse: event.target.value }))}>
                              <option value="">Altersklasse wählen</option>
                              {editAgeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          ) : (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">{t.altersklasse}</span>
                          )}
                        </td>
                        <td className="text-right">
                          {editing ? (
                            <div className="flex justify-end gap-2">
                              <button type="button" className="btn btn-primary" onClick={() => saveParticipantCorrection(t)} disabled={editSaving}>{editSaving ? "Speichert…" : "Speichern"}</button>
                              <button type="button" className="btn btn-secondary" onClick={cancelEditParticipant} disabled={editSaving}>Abbrechen</button>
                            </div>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => beginEditParticipant(t)} disabled={editSaving}>Bearbeiten</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {sichtbareTeilnehmer.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">Keine Teilnehmer für diesen Filter gefunden.</td></tr>
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
          <p className="mt-1 text-sm text-zinc-600">Klick auf einen Verein, um die gemeldeten Teilnehmer anzuzeigen und bei Bedarf als Admin zu korrigieren.</p>
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
            <div key={verein.id} className={`overflow-hidden rounded-3xl border bg-white transition-all duration-200 ${istOffen ? "border-indigo-200 shadow-[0_14px_34px_rgba(79,70,229,0.10)]" : "border-zinc-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-zinc-300 hover:shadow-[0_12px_28px_rgba(16,24,40,0.08)]"}`}>
              <button type="button" className="flex h-full w-full flex-col gap-4 px-5 py-5 text-left transition-colors hover:bg-zinc-50/70 sm:px-6" onClick={() => toggleTeilnehmer(verein.id)}>
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
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTeilnehmerBadgeClass(count)}`}>{count} Teilnehmer</span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">{getStatusText(count)}</span>
                  <span className="ml-auto text-sm font-semibold text-indigo-600">{istOffen ? "Schließen" : "Teilnehmer anzeigen"}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VereineTab;
