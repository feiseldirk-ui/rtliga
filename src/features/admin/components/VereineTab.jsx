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

function formatAuditDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
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
  const [editForm, setEditForm] = useState({ vorname: "", name: "", altersklasse: "", bemerkung: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");

  const [editingClubId, setEditingClubId] = useState(null);
  const [clubForm, setClubForm] = useState({ vereinsname: "", bemerkung: "" });
  const [clubSaving, setClubSaving] = useState(false);

  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);

  const requestIdRef = useRef(0);

  const fetchAuditLog = React.useCallback(async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("list_admin_audit_log", { p_limit: 100 }),
      );
      if (error) throw error;
      setAuditRows(data || []);
    } catch (error) {
      console.error("Änderungsverlauf konnte nicht geladen werden:", error);
      setAuditError("Änderungsverlauf konnte nicht geladen werden.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

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
    const unsubscribe = subscribeToTables({
      tables: ["vereine", "verein_teilnehmer", "verein_ergebnisse"],
      onChange: fetchVereine,
    });
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
      bemerkung: "",
    });
    setEditMessage("");
    setEditError("");
  };

  const cancelEditParticipant = () => {
    setEditingParticipantId(null);
    setEditForm({ vorname: "", name: "", altersklasse: "", bemerkung: "" });
    setEditError("");
  };

  const saveParticipantCorrection = async (teilnehmer) => {
    const vorname = editForm.vorname.trim();
    const name = editForm.name.trim();
    const altersklasse = editForm.altersklasse.trim();
    const bemerkung = editForm.bemerkung.trim();

    if (!vorname || !name || !altersklasse) {
      setEditError("Vorname, Nachname und Altersklasse müssen ausgefüllt sein.");
      return;
    }
    if (!bemerkung) {
      setEditError("Bitte eine Bemerkung bzw. den Grund der Änderung eintragen.");
      return;
    }

    const unchanged =
      vorname === String(teilnehmer.vorname || "").trim() &&
      name === String(teilnehmer.name || "").trim() &&
      altersklasse === String(teilnehmer.altersklasse || "").trim();

    if (unchanged) {
      setEditError("Es wurde keine fachliche Änderung vorgenommen.");
      return;
    }

    const confirmed = window.confirm(
      `Teilnehmerdaten wirklich ändern?\n\n${teilnehmer.vorname} ${teilnehmer.name} (${teilnehmer.altersklasse || "ohne Klasse"})\n→\n${vorname} ${name} (${altersklasse})\n\nGrund: ${bemerkung}\n\nVorhandene Ergebnisse bleiben demselben Teilnehmer zugeordnet.`
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
        p_bemerkung: bemerkung,
      });
      if (error) throw error;

      await loadTeilnehmer(teilnehmer.verein_id);
      setEditingParticipantId(null);
      setEditForm({ vorname: "", name: "", altersklasse: "", bemerkung: "" });
      setEditMessage(`Teilnehmerdaten von ${vorname} ${name} wurden aktualisiert und protokolliert.`);
      await fetchAuditLog();
      if (typeof onRefreshStats === "function") onRefreshStats();
      window.dispatchEvent(new CustomEvent("rtliga-admin-refresh"));
    } catch (error) {
      console.error("Teilnehmerkorrektur fehlgeschlagen:", error);
      setEditError("Die Teilnehmerdaten konnten nicht gespeichert werden. Bitte Admin-Sitzung prüfen und erneut versuchen.");
    } finally {
      setEditSaving(false);
    }
  };

  const beginEditClub = (verein) => {
    setEditingClubId(verein.id);
    setClubForm({ vereinsname: verein.vereinsname || "", bemerkung: "" });
    setEditMessage("");
    setEditError("");
  };

  const cancelEditClub = () => {
    setEditingClubId(null);
    setClubForm({ vereinsname: "", bemerkung: "" });
    setEditError("");
  };

  const saveClubCorrection = async (verein) => {
    const vereinsname = clubForm.vereinsname.trim();
    const bemerkung = clubForm.bemerkung.trim();

    if (!vereinsname) {
      setEditError("Der Vereinsname muss ausgefüllt sein.");
      return;
    }
    if (!bemerkung) {
      setEditError("Bitte eine Bemerkung bzw. den Grund der Änderung eintragen.");
      return;
    }
    if (vereinsname === String(verein.vereinsname || "").trim()) {
      setEditError("Der Vereinsname wurde nicht geändert.");
      return;
    }

    const confirmed = window.confirm(
      `Vereinsname wirklich ändern?\n\n${verein.vereinsname}\n→\n${vereinsname}\n\nGrund: ${bemerkung}\n\nLogin-Daten werden nicht verändert. Teilnehmer und vorhandene Ergebnisse bleiben demselben Verein zugeordnet.`
    );
    if (!confirmed) return;

    setClubSaving(true);
    setEditError("");
    setEditMessage("");
    try {
      const { error } = await supabase.rpc("admin_update_verein_stammdaten", {
        p_verein_id: verein.id,
        p_vereinsname: vereinsname,
        p_bemerkung: bemerkung,
      });
      if (error) throw error;

      setEditingClubId(null);
      setClubForm({ vereinsname: "", bemerkung: "" });
      setEditMessage(`Vereinsname wurde in „${vereinsname}“ geändert und protokolliert.`);
      await Promise.all([fetchVereine(), fetchAuditLog()]);
      if (offenVereinId === verein.id) await loadTeilnehmer(verein.id);
      window.dispatchEvent(new CustomEvent("rtliga-admin-refresh"));
    } catch (error) {
      console.error("Vereinskorrektur fehlgeschlagen:", error);
      setEditError("Der Vereinsname konnte nicht gespeichert werden. Bitte prüfen, ob der Name bereits verwendet wird.");
    } finally {
      setClubSaving(false);
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

          {editMessage ? <div className="mx-5 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{editMessage}</div> : null}
          {editError ? <div className="mx-5 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{editError}</div> : null}

          {offeneTeilnehmer.length > 0 ? (
            <div className="table-wrap rounded-none border-0 shadow-none">
              <table className="table min-w-[820px]">
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
                      <React.Fragment key={t.id}>
                        <tr>
                          <td className="font-medium text-zinc-900">
                            {editing ? <input className="input min-w-[150px]" value={editForm.vorname} onChange={(event) => setEditForm((prev) => ({ ...prev, vorname: event.target.value }))} /> : t.vorname}
                          </td>
                          <td>
                            {editing ? <input className="input min-w-[170px]" value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} /> : t.name}
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
                              <button type="button" className="btn btn-secondary" onClick={() => beginEditParticipant(t)} disabled={editSaving || clubSaving}>Bearbeiten</button>
                            )}
                          </td>
                        </tr>
                        {editing ? (
                          <tr>
                            <td colSpan={4} className="bg-indigo-50/40 px-4 py-4">
                              <label className="block text-sm font-semibold text-zinc-700">Bemerkung / Grund der Änderung *</label>
                              <textarea
                                className="input mt-2 min-h-[86px] w-full resize-y"
                                value={editForm.bemerkung}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, bemerkung: event.target.value }))}
                                placeholder="z. B. Schreibfehler laut Rückmeldung des Vereins korrigiert"
                                maxLength={500}
                              />
                              <p className="mt-1 text-xs text-zinc-500">Pflichtfeld. Wird zusammen mit altem und neuem Wert im Änderungsverlauf gespeichert.</p>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                  {sichtbareTeilnehmer.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">Keine Teilnehmer für diesen Filter gefunden.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-b-3xl border-t border-zinc-200 bg-white px-5 py-8 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-xl text-zinc-500">∅</div>
              <p className="mt-4 text-sm font-medium text-zinc-700">Für diesen Verein sind aktuell noch keine Teilnehmer hinterlegt.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Alle Vereine</h2>
          <p className="mt-1 text-sm text-zinc-600">Teilnehmer und fachliche Vereinsnamen können durch Admins korrigiert werden. Login-Daten bleiben unverändert.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-4 py-3 text-sm text-zinc-600 shadow-sm">
          <span className="font-semibold text-zinc-900">{vereine.length}</span> Vereine geladen
        </div>
      </div>

      {editError && !offenerVerein ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{editError}</div> : null}
      {editMessage && !offenerVerein ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{editMessage}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vereine.map((verein) => {
          const istOffen = offenVereinId === verein.id;
          const count = teilnehmerCounts[verein.id] || 0;
          const clubEditing = editingClubId === verein.id;

          return (
            <div key={verein.id} className={`overflow-hidden rounded-3xl border bg-white transition-all duration-200 ${istOffen ? "border-indigo-200 shadow-[0_14px_34px_rgba(79,70,229,0.10)]" : "border-zinc-200 shadow-sm"}`}>
              {clubEditing ? (
                <div className="space-y-4 p-5">
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700">Vereinsname</label>
                    <input className="input mt-2 w-full" value={clubForm.vereinsname} onChange={(event) => setClubForm((prev) => ({ ...prev, vereinsname: event.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700">Bemerkung / Grund der Änderung *</label>
                    <textarea className="input mt-2 min-h-[92px] w-full resize-y" value={clubForm.bemerkung} onChange={(event) => setClubForm((prev) => ({ ...prev, bemerkung: event.target.value }))} placeholder="Warum wird der Vereinsname korrigiert?" maxLength={500} />
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">Login-E-Mail, Kennwort, Auth-Benutzer und Benutzer-ID werden nicht verändert.</div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => saveClubCorrection(verein)} disabled={clubSaving}>{clubSaving ? "Speichert…" : "Speichern"}</button>
                    <button type="button" className="btn btn-secondary" onClick={cancelEditClub} disabled={clubSaving}>Abbrechen</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="flex w-full flex-col gap-4 px-5 py-5 text-left transition-colors hover:bg-zinc-50/70 sm:px-6" onClick={() => toggleTeilnehmer(verein.id)}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm">
                        {(verein.vereinsname || "V").split(" ").slice(0, 2).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xl font-semibold text-zinc-900">{verein.vereinsname}</div>
                        <div className="mt-1 truncate text-sm text-zinc-500">{verein.email || "Keine E-Mail hinterlegt"}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTeilnehmerBadgeClass(count)}`}>{count} Teilnehmer</span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">{getStatusText(count)}</span>
                      <span className="ml-auto text-sm font-semibold text-indigo-600">{istOffen ? "Schließen" : "Teilnehmer anzeigen"}</span>
                    </div>
                  </button>
                  <div className="border-t border-zinc-100 px-5 py-3">
                    <button type="button" className="btn btn-secondary w-full" onClick={() => beginEditClub(verein)} disabled={editSaving || clubSaving}>Vereinsname korrigieren</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Änderungsverlauf</h3>
            <p className="mt-1 text-sm text-zinc-600">Protokollierte Admin-Korrekturen mit altem Wert, neuem Wert und Begründung.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={fetchAuditLog} disabled={auditLoading}>{auditLoading ? "Lädt…" : "Aktualisieren"}</button>
            <button type="button" className="btn btn-secondary" onClick={async () => { const next = !auditOpen; setAuditOpen(next); if (next && auditRows.length === 0) await fetchAuditLog(); }}>{auditOpen ? "Schließen" : "Anzeigen"}</button>
          </div>
        </div>

        {auditOpen ? (
          <div className="p-5">
            {auditError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{auditError}</div> : null}
            {!auditLoading && auditRows.length === 0 && !auditError ? <p className="text-sm text-zinc-500">Noch keine protokollierten Änderungen vorhanden.</p> : null}
            {auditRows.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                <table className="min-w-[940px] w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Zeitpunkt</th>
                      <th className="px-4 py-3 font-semibold">Bereich</th>
                      <th className="px-4 py-3 font-semibold">Feld</th>
                      <th className="px-4 py-3 font-semibold">Alt</th>
                      <th className="px-4 py-3 font-semibold">Neu</th>
                      <th className="px-4 py-3 font-semibold">Bemerkung</th>
                      <th className="px-4 py-3 font-semibold">Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {auditRows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatAuditDate(row.created_at)}</td>
                        <td className="px-4 py-3"><span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold">{row.entity_type === "teilnehmer" ? `Teilnehmer #${row.teilnehmer_id}` : "Verein"}</span></td>
                        <td className="px-4 py-3 font-medium text-zinc-800">{row.field_name}</td>
                        <td className="px-4 py-3 text-zinc-600">{row.old_value || "–"}</td>
                        <td className="px-4 py-3 font-medium text-zinc-900">{row.new_value || "–"}</td>
                        <td className="max-w-[320px] whitespace-normal px-4 py-3 text-zinc-700">{row.bemerkung}</td>
                        <td className="px-4 py-3 text-zinc-600">{row.admin_email || "Admin"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VereineTab;
