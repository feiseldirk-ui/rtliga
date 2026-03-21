import React, { useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { loadSeasonSettings, saveSeasonSettings, saveSeasonSettingsToSupabase, useIsNewSeasonAllowed } from "../../../lib/seasonSettings";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { getActiveSeason } from "../../../lib/seasonScope";

export default function ArchivTab() {
  const [confirmText, setConfirmText] = useState("");
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const settings = loadSeasonSettings();
  const activeSeason = getActiveSeason(settings);
  const newSeasonAllowed = useIsNewSeasonAllowed();
  const nextSeason = activeSeason + 1;

  const seasonStatus = useMemo(() => {
    if (newSeasonAllowed) return "Saisonwechsel ist ab sofort freigegeben.";
    return "Saisonwechsel wird aus Sicherheitsgründen erst ab dem neuen Kalenderjahr freigegeben.";
  }, [newSeasonAllowed]);

  const canArchive = newSeasonAllowed && confirmText.trim() === `SAISON ${nextSeason}`;

  const handlePrepareSeason = async () => {
    if (!canArchive || saving) return;
    setSaving(true);
    setNotice(null);

    try {
      await ensureSupabaseSession();
      const { data, error } = await supabase.rpc("prepare_next_season", {
        p_current_season: activeSeason,
        p_next_season: nextSeason,
      });

      if (error) throw error;

      const updatedSettings = saveSeasonSettings({
        ...settings,
        activeSeason: nextSeason,
      });
      await saveSeasonSettingsToSupabase(updatedSettings);

      setConfirmText("");
      const copiedParticipants = Number(data?.copied_participants || 0);
      setNotice({
        type: "success",
        message: `Saison ${nextSeason} ist aktiv. ${copiedParticipants} Teilnehmer wurden in die neue Saison übernommen.`,
      });
    } catch (error) {
      const message = String(error?.message || error || "");
      const hint = message.includes("prepare_next_season")
        ? "Die Archiv-SQL ist noch nicht in Supabase angelegt. Bitte zuerst die Datei 009_archive_seasons.sql ausführen."
        : message || "Saisonwechsel konnte nicht vorbereitet werden.";
      setNotice({ type: "error", message: hint });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-amber-50/60 to-orange-50/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">Archiv & Saisonwechsel</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Neue Saison vorbereiten</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Statt Daten zu löschen wird die alte Saison archiviert. Teilnehmer werden übernommen, Ergebnisse bleiben im alten Jahr,
              und für die neue Saison werden frische Zeitfenster angelegt.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktive Saison</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{activeSeason}</p>
              <p className="mt-1 text-sm text-zinc-500">Aktuelles Wertungsjahr</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nächste Saison</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{nextSeason}</p>
              <p className="mt-1 text-sm text-zinc-500">Bereit zur Aktivierung</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</p>
              <p className="mt-2 text-sm font-semibold text-zinc-900">{newSeasonAllowed ? "Freigegeben" : "Gesperrt"}</p>
              <p className="mt-1 text-sm text-zinc-500">{seasonStatus}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6 space-y-5">
        <div>
          <h3 className="text-xl font-semibold text-zinc-900">Archiv jetzt ausführen</h3>
          <p className="mt-1 text-sm text-zinc-600">Die neue Saison wird aktiviert, Teilnehmer werden kopiert und Zeitfenster für WK1–WK9 werden leer angelegt.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">Was übernommen wird</p>
            <ul className="mt-2 space-y-1 text-zinc-600">
              <li>• Teilnehmer aus Saison {activeSeason}</li>
              <li>• PDF-Layout und Logos</li>
              <li>• Leere Zeitfenster WK1–WK9</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">Was archiviert bleibt</p>
            <ul className="mt-2 space-y-1 text-zinc-600">
              <li>• Ergebnisse der Saison {activeSeason}</li>
              <li>• Bisherige Zeitfenster</li>
              <li>• Vereinsdaten der alten Saison</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Vor der ersten Nutzung muss in Supabase die Migration <strong>009_archive_seasons.sql</strong> ausgeführt werden.
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-zinc-700">Bestätigung</label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`Zum Freigeben: SAISON ${nextSeason}`} className="input" />
        </div>

        {notice ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {notice.message}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canArchive || saving}
          onClick={handlePrepareSeason}
          className={`btn ${canArchive && !saving ? "btn-primary" : "btn-secondary opacity-60 cursor-not-allowed"}`}
        >
          {saving ? `Saison ${nextSeason} wird vorbereitet…` : `Neue Saison ${nextSeason} vorbereiten`}
        </button>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          Nach erfolgreicher Vorbereitung springt die App direkt auf die Saison {nextSeason}. Alte Daten bleiben weiter in Supabase erhalten und können später separat ausgewertet werden.
        </div>
      </div>
    </div>
  );
}
