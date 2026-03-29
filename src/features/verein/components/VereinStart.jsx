import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { clearVereinSession, readVereinSession } from "../../../lib/storage/vereinSession";
import { stopGlobalAudio } from "../../../shared/media/audioPlayer";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";

import DashboardShell from "../../../shared/ui/dashboard/DashboardShell";
import TeilnehmerPanel from "../../../shared/ui/dashboard/TeilnehmerPanel";
import StatCards from "../../../shared/ui/dashboard/StatCards";
import MediaPanel from "../../../shared/ui/dashboard/MediaPanel";

import VereinErgebnisseEintragen from "./VereinErgebnisseEintragen";
import VereinErgebnisseAnzeigen from "./VereinErgebnisseAnzeigen";
import GesamtergebnisseTab from "./GesamtergebnisseTab";
import VereinRundenprotokollTab from "./VereinRundenprotokollTab";

const ALTERS_KLASSEN = ["Schüler", "Jugend", "Junioren", "Damen", "Herren", "Altersklasse"];

function Tabs({ active, onTabChange }) {
  const items = [
    { key: "teilnehmer", label: "Teilnehmer", shortLabel: "Teilnehmer" },
    { key: "ergebnisse", label: "Ergebnisse erfassen", shortLabel: "Erfassen" },
    { key: "meine", label: "Meine Ergebnisse", shortLabel: "Ergebnisse" },
    { key: "protokolle", label: "Rundenprotokolle", shortLabel: "Protokolle" },
    { key: "gesamt", label: "Gesamtrangliste", shortLabel: "Rangliste" },
  ];

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:px-5 sm:py-5 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3 sm:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Bereiche</p>
        <p className="text-xs text-zinc-400">Wischen oder tippen</p>
      </div>

      <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
        <div className="flex min-w-max gap-2 px-1 sm:flex-wrap sm:gap-3 sm:px-0">
          {items.map((t) => {
            const isActive = active === t.key;

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={isActive
                  ? "btn btn-primary whitespace-nowrap !rounded-2xl !px-4 !py-2.5 text-sm shadow-[0_16px_32px_rgba(99,102,241,0.24)] sm:!px-5 sm:!py-3"
                  : "btn btn-secondary whitespace-nowrap !rounded-2xl !px-4 !py-2.5 text-sm border-zinc-300 bg-white/90 hover:border-indigo-200 hover:bg-indigo-50/60 sm:!px-5 sm:!py-3"
                }
                aria-pressed={isActive}
              >
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function UnsavedChangesModal({ open, actionType, onSave, onDiscard, onCancel, busy = false }) {
  if (!open) return null;

  const heading = actionType === "logout" ? "Ungespeicherte Änderungen vor dem Verlassen" : "Ungespeicherte Änderungen vor dem Bereichswechsel";
  const body = actionType === "logout"
    ? "Es gibt noch ungespeicherte Änderungen im geöffneten Eingabebereich. Du kannst jetzt speichern, die Änderungen verwerfen oder im Vereinsbereich bleiben."
    : "Es gibt noch ungespeicherte Änderungen im geöffneten Eingabebereich. Du kannst jetzt speichern, die Änderungen verwerfen oder im aktuellen Bereich bleiben.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold text-zinc-950">{heading}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="btn btn-primary !min-h-[48px] !rounded-2xl !px-5"
            onClick={onSave}
            disabled={busy}
          >
            {busy ? "Speichert…" : "Speichern und fortfahren"}
          </button>
          <button
            type="button"
            className="btn btn-secondary !min-h-[48px] !rounded-2xl !px-5"
            onClick={onDiscard}
            disabled={busy}
          >
            Änderungen verwerfen
          </button>
          <button
            type="button"
            className="btn btn-secondary !min-h-[48px] !rounded-2xl !px-5"
            onClick={onCancel}
            disabled={busy}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

function keyName(vorname, nachname) {
  return `${(vorname || "").trim().toLowerCase()}|${(nachname || "")
    .trim()
    .toLowerCase()}`;
}

export default function VereinStart() {
  const navigate = useNavigate();

  const [verein, setVerein] = useState(null);
  const [activeTab, setActiveTab] = useState("teilnehmer");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const unsavedChangesRef = useRef(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [unsavedActionBusy, setUnsavedActionBusy] = useState(false);
  const unsavedActionsRef = useRef({
    save: async () => true,
    discard: async () => true,
  });

  const [teilnehmer, setTeilnehmer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contentReloadKey, setContentReloadKey] = useState(0);

  const [form, setForm] = useState({
    vorname: "",
    name: "",
    altersklasse: "",
  });

  const [bearbeiteId, setBearbeiteId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const gespeicherterVerein = readVereinSession();
      if (!gespeicherterVerein) {
        navigate("/login");
        return;
      }

      const v = { ...gespeicherterVerein, ...(verein || {}) };
      setVerein(v);

      const session = await ensureSupabaseSession();
      if (!session) {
        clearVereinSession();
        navigate("/login");
        return;
      }

      await fetchTeilnehmerMitErgebnisStatus(v);
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleDirtyChange = (next) => {
    const value = !!next;
    unsavedChangesRef.current = value;
    setHasUnsavedChanges(value);
  };

  const registerUnsavedActions = (actions) => {
    unsavedActionsRef.current = actions || {
      save: async () => true,
      discard: async () => true,
    };
  };

  const finalizePendingAction = async (action) => {
    if (!action) return;

    if (action.type === "tab") {
      setActiveTab(action.nextTab);
      return;
    }

    if (action.type === "logout") {
      try {
        stopGlobalAudio();
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        clearVereinSession();
        navigate("/", { replace: true });
        window.setTimeout(() => {
          window.location.assign(import.meta.env.BASE_URL || "/");
        }, 20);
      }
    }
  };

  const requestTabChange = (nextTab) => {
    if (nextTab === activeTab) return;

    if (unsavedChangesRef.current || hasUnsavedChanges) {
      setPendingAction({ type: "tab", nextTab });
      setShowUnsavedModal(true);
      return;
    }

    setActiveTab(nextTab);
  };


  useEffect(() => {
    if (!verein) return;
    setContentReloadKey((value) => value + 1);
    window.dispatchEvent(new CustomEvent("rtliga-verein-tab-activated", { detail: { tab: activeTab } }));
  }, [activeTab, verein]);

  const requestLogout = () => {
    if (unsavedChangesRef.current || hasUnsavedChanges) {
      setPendingAction({ type: "logout" });
      setShowUnsavedModal(true);
      return;
    }

    finalizePendingAction({ type: "logout" });
  };

  const handleModalCancel = () => {
    if (unsavedActionBusy) return;
    setShowUnsavedModal(false);
    setPendingAction(null);
  };

  const handleModalSave = async () => {
    setUnsavedActionBusy(true);
    try {
      const ok = await (unsavedActionsRef.current.save?.() ?? true);
      if (!ok) return;
      unsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
      const action = pendingAction;
      setShowUnsavedModal(false);
      setPendingAction(null);
      await finalizePendingAction(action);
    } finally {
      setUnsavedActionBusy(false);
    }
  };

  const handleModalDiscard = async () => {
    setUnsavedActionBusy(true);
    try {
      await (unsavedActionsRef.current.discard?.() ?? true);
      unsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
      const action = pendingAction;
      setShowUnsavedModal(false);
      setPendingAction(null);
      await finalizePendingAction(action);
    } finally {
      setUnsavedActionBusy(false);
    }
  };

  const fetchTeilnehmerMitErgebnisStatus = async (vereinObj) => {
    setLoading(true);

    const vereinId = vereinObj?.id;
    const vereinsname = vereinObj?.vereinsname;

    if (!vereinId || !vereinsname) {
      setTeilnehmer([]);
      setLoading(false);
      return;
    }

    const { data: teiln, error: teilnErr } = await supabase
      .from("verein_teilnehmer")
      .select("id, vorname, name, altersklasse")
      .eq("verein_id", vereinId);

    if (teilnErr) {
      logError("Teilnehmer konnten nicht geladen werden.");
      setTeilnehmer([]);
      setLoading(false);
      return;
    }

    const teilnehmerListe = teiln || [];
    if (teilnehmerListe.length === 0) {
      setTeilnehmer([]);
      setLoading(false);
      return;
    }

    const { data: erg, error: ergErr } = await supabase
      .from("verein_ergebnisse")
      .select("vorname, nachname, verein")
      .eq("verein", vereinsname);

    if (ergErr) {
      logError("Ergebnisstatus konnte nicht geladen werden.");
      setTeilnehmer(teilnehmerListe.map((t) => ({ ...t, hatErgebnisse: false })));
      setLoading(false);
      return;
    }

    const ergSet = new Set((erg || []).map((r) => keyName(r.vorname, r.nachname)));

    const mitStatus = teilnehmerListe.map((t) => ({
      ...t,
      hatErgebnisse: ergSet.has(keyName(t.vorname, t.name)),
    }));

    setTeilnehmer(mitStatus);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const total = teilnehmer.length;
    const mitErgebnissen = teilnehmer.filter((t) => t.hatErgebnisse).length;
    const ohneErgebnisse = total - mitErgebnissen;
    return { total, mitErgebnissen, ohneErgebnisse };
  }, [teilnehmer]);


  const refresh = async () => {
    const gespeicherterVerein = readVereinSession();
    if (!gespeicherterVerein) return;
    await fetchTeilnehmerMitErgebnisStatus({ ...gespeicherterVerein, ...(verein || {}) });
  };

  const onAdd = async () => {
    if (!verein) return;

    const vorname = form.vorname.trim();
    const name = form.name.trim();
    const altersklasse = form.altersklasse?.trim();

    if (!vorname || !name || !altersklasse) return;

    const { error } = await supabase.from("verein_teilnehmer").insert({
      vorname,
      name,
      altersklasse,
      verein_id: verein.id,
    });

    if (error) {
      logError("Teilnehmer konnte nicht hinzugefügt werden.");
      return;
    }

    setForm({ vorname: "", name: "", altersklasse: "" });
    await refresh();
  };

  const onEdit = (t) => {
    setBearbeiteId(t.id);
    setForm({
      vorname: t.vorname ?? "",
      name: t.name ?? "",
      altersklasse: t.altersklasse ?? "",
    });
  };

  const onUpdate = async () => {
    if (!verein || !bearbeiteId) return;

    const { error } = await supabase
      .from("verein_teilnehmer")
      .update({
        vorname: form.vorname.trim(),
        name: form.name.trim(),
        altersklasse: form.altersklasse,
      })
      .eq("id", bearbeiteId);

    if (error) {
      logError("Teilnehmer konnte nicht aktualisiert werden.");
      return;
    }

    setBearbeiteId(null);
    setForm({ vorname: "", name: "", altersklasse: "" });
    await refresh();
  };

  const onCancelEdit = () => {
    setBearbeiteId(null);
    setForm({ vorname: "", name: "", altersklasse: "" });
  };

  const onDelete = async (id) => {
    if (!verein) return;

    const bestaetigt = window.confirm("Teilnehmer wirklich löschen?");
    if (!bestaetigt) return;

    const { error } = await supabase
      .from("verein_teilnehmer")
      .delete()
      .eq("id", id);

    if (error) {
      logError("Teilnehmer konnte nicht gelöscht werden.");
      return;
    }

    await refresh();
  };

  const gesperrtFn = (t) => !!t.hatErgebnisse;

  if (!verein) return null;

  return (
    <DashboardShell
      titleTop="Verein"
      title={verein.vereinsname || "Vereinbereich"}
      subtitle="Zentrale Oberfläche für Teilnehmer, Ergebniserfassung, Ranglisten und Medien im Light Mode."
      hideStickyIdentity
      hideHero
      leftSlot={<MediaPanel compact showIntro={false} filterType="audio" areaLabel="Vereinsmedien" />}
      right={<MediaPanel compact showIntro={false} filterType="video" areaLabel="Vereinsmedien" />}
      stickyContent={
        <div className="space-y-3">
          <Tabs active={activeTab} onTabChange={requestTabChange} />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <button
              type="button"
              className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 sm:w-auto"
              onClick={requestLogout}
            >
              Vereinsbereich verlassen
            </button>
          </div>
          <div className="flex justify-center overflow-x-auto">
            <StatCards
              compact
              total={stats.total}
              mitErgebnissen={stats.mitErgebnissen}
              ohneErgebnisse={stats.ohneErgebnisse}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {activeTab === "teilnehmer" && (
          <TeilnehmerPanel
            teilnehmer={teilnehmer}
            form={form}
            setForm={setForm}
            bearbeiteId={bearbeiteId}
            onAdd={onAdd}
            onUpdate={onUpdate}
            onCancelEdit={onCancelEdit}
            onEdit={onEdit}
            onDelete={onDelete}
            gesperrtFn={gesperrtFn}
            altersklassen={ALTERS_KLASSEN}
            loading={loading}
          />
        )}

        {activeTab === "ergebnisse" && (
          <VereinErgebnisseEintragen
            verein={verein}
            teilnehmer={teilnehmer}
            refreshTeilnehmer={refresh}
            onDirtyChange={handleDirtyChange}
            onRegisterUnsavedActions={registerUnsavedActions}
          />
        )}

        {activeTab === "meine" && <VereinErgebnisseAnzeigen verein={verein} />}

        {activeTab === "protokolle" && <VereinRundenprotokollTab key={`protokolle-${contentReloadKey}`} verein={verein} />}

        {activeTab === "gesamt" && <GesamtergebnisseTab />}
      </div>
      <UnsavedChangesModal
        open={showUnsavedModal}
        actionType={pendingAction?.type}
        onSave={handleModalSave}
        onDiscard={handleModalDiscard}
        onCancel={handleModalCancel}
        busy={unsavedActionBusy}
      />
    </DashboardShell>
  );
}