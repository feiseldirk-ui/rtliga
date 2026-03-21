import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { subscribeToTables } from "../../../lib/realtime";
import { getActiveSeason, seasonOrNullFilter, withSeasonPayload } from "../../../lib/seasonScope";

const BASIS_ZEITFENSTER = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, wettkampf: i + 1, start: "", ende: "" }));
const MINUTE_MS = 60 * 1000;

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return "";
  return `${dateValue}T${timeValue}`;
}

function splitDateTimeValue(value) {
  const localValue = toDateTimeLocalValue(value);
  if (!localValue) return { date: "", time: "" };
  const [date, time] = localValue.split("T");
  return { date: date || "", time: (time || "").slice(0, 5) };
}

function parseTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function formatForInput(ts) {
  if (ts == null) return "";
  return new Date(ts).toISOString().slice(0, 16);
}

function sortFenster(list) {
  return [...list].sort((a, b) => a.wettkampf - b.wettkampf);
}

function validateFenster(fenster, basisListe) {
  if (!fenster.start || !fenster.ende) return { ok: true };
  const start = parseTimestamp(fenster.start);
  const ende = parseTimestamp(fenster.ende);

  if (start === null || ende === null) {
    return { ok: false, message: "❌ Ungültiges Datum oder ungültige Uhrzeit." };
  }

  if (start >= ende) {
    return { ok: false, message: "❌ Das Enddatum muss nach dem Startdatum liegen." };
  }

  const overlappingItems = basisListe.filter((item) => {
    if (item.wettkampf === fenster.wettkampf || !item.start || !item.ende) return false;
    const otherStart = parseTimestamp(item.start);
    const otherEnd = parseTimestamp(item.ende);
    if (otherStart == null || otherEnd == null) return false;
    return start < otherEnd && ende > otherStart;
  });

  if (overlappingItems.length) {
    const names = overlappingItems.map((item) => `WK${item.wettkampf}`).join(", ");
    return { ok: false, message: `❌ WK${fenster.wettkampf} überschneidet sich mit ${names}.` };
  }

  return { ok: true };
}

function DateTimeEditor({ label, value, editorKey, openEditorKey, onToggle, onApply }) {
  const [localError, setLocalError] = useState("");
  const initial = useMemo(() => splitDateTimeValue(value), [value]);
  const open = openEditorKey === editorKey;
  const [draftDate, setDraftDate] = useState(initial.date);
  const [draftTime, setDraftTime] = useState(initial.time || "16:00");

  useEffect(() => {
    setDraftDate(initial.date);
    setDraftTime(initial.time || "16:00");
    setLocalError("");
  }, [initial, open]);

  return (
    <div className="relative min-w-[220px] overflow-visible">
      <button type="button" className="input flex min-h-[46px] items-center justify-between gap-3 text-left" onClick={() => onToggle(open ? null : editorKey)}>
        <span className={value ? "text-zinc-900" : "text-zinc-400"}>{value ? new Date(value).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : label}</span>
        <span aria-hidden="true">🗓️</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-[396px] max-w-[min(396px,calc(100vw-1rem))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-[0_18px_36px_rgba(16,24,40,0.12)]">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Tag</label>
              <input type="date" value={draftDate} onChange={(event) => { setDraftDate(event.target.value); setLocalError(""); }} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Uhrzeit</label>
              <input type="time" value={draftTime} onChange={(event) => { setDraftTime(event.target.value); setLocalError(""); }} className="input" step="60" />
            </div>
            {localError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{localError}</div> : null}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button type="button" className="btn-mini min-w-0 flex-1 whitespace-nowrap" onClick={() => { setDraftDate(""); setDraftTime("16:00"); }}>Zurücksetzen</button>
              <button type="button" className="btn-mini min-w-0 flex-1 whitespace-nowrap" onClick={() => onToggle(null)}>Abbrechen</button>
              <button
                type="button"
                className="btn-mini min-w-0 w-full whitespace-nowrap border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-500"
                onClick={() => {
                  const result = onApply(fromDateAndTime(draftDate, draftTime));
                  if (result?.ok) {
                    setLocalError("");
                    onToggle(null);
                  } else if (result?.message) {
                    setLocalError(result.message);
                  }
                }}
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ZeitfensterTab({ onRefreshStats }) {
  const [zeitfenster, setZeitfenster] = useState(BASIS_ZEITFENSTER);
  const [originalZeitfenster, setOriginalZeitfenster] = useState(BASIS_ZEITFENSTER);
  const [hinweis, setHinweis] = useState("");
  const [gespeichert, setGespeichert] = useState(null);
  const [savingWettkampf, setSavingWettkampf] = useState(null);
  const [openEditorKey, setOpenEditorKey] = useState(null);

  const fetchZeitfenster = React.useCallback(async () => {
    await ensureSupabaseSession();
    const activeSeason = getActiveSeason();
    const { data, error } = await seasonOrNullFilter(supabase.from("zeitfenster").select("*").order("wettkampf", { ascending: true }), activeSeason);

    const kombiniert = BASIS_ZEITFENSTER.map((wk) => {
      const dbWert = data?.find((d) => d.wettkampf === wk.wettkampf);
      return dbWert ? { ...wk, ...dbWert } : wk;
    });

    if (error) logError("Daten konnten nicht geladen werden.");
    setZeitfenster(sortFenster(kombiniert));
    setOriginalZeitfenster(sortFenster(kombiniert));
    if (typeof onRefreshStats === "function") onRefreshStats();
  }, [onRefreshStats]);

  useEffect(() => {
    fetchZeitfenster();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchZeitfenster();
    };
    window.addEventListener("pageshow", fetchZeitfenster);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pageshow", fetchZeitfenster);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchZeitfenster]);

  useEffect(() => subscribeToTables({ tables: ["zeitfenster"], onChange: fetchZeitfenster }), [fetchZeitfenster]);

  const resetFenster = (fensterId) => {
    const original = originalZeitfenster.find((item) => item.id === fensterId);
    if (!original) return;
    setZeitfenster((prev) => prev.map((item) => (item.id === fensterId ? { ...original } : item)));
  };

  const aktualisiereZeitfenster = (id, feld, wert) => {
    let result = { ok: false };
    setZeitfenster((prev) => {
      const next = prev.map((z) => (z.id === id ? { ...z, [feld]: wert } : z));
      const aktuellesFenster = next.find((z) => z.id === id);
      const validation = validateFenster(aktuellesFenster, next);
      if (!validation.ok) {
        setHinweis(validation.message);
        result = validation;
        return prev;
      }
      setHinweis("");
      result = { ok: true };
      return next;
    });
    return result;
  };

  const speichereZeitfenster = async (fenster) => {
    if (!fenster.start || !fenster.ende) {
      setHinweis("❌ Bitte Start und Ende ausfüllen.");
      return;
    }

    setSavingWettkampf(fenster.wettkampf);
    const normalized = { ...fenster };
    const basisListe = zeitfenster.map((item) => (item.id === fenster.id ? normalized : item));
    const validation = validateFenster(normalized, basisListe);
    if (!validation.ok) {
      setHinweis(validation.message);
      resetFenster(fenster.id);
      setSavingWettkampf(null);
      return;
    }

    const activeSeason = getActiveSeason();
    const { data, error: findError } = await supabase.from("zeitfenster").select("id").eq("wettkampf", normalized.wettkampf).eq("saison", activeSeason).maybeSingle();
    if (findError) {
      logError("Zeitfenster konnte nicht gefunden werden.");
      setHinweis("❌ Fehler beim Suchen in der Datenbank");
      setSavingWettkampf(null);
      return;
    }

    let updateError;
    if (data) {
      ({ error: updateError } = await supabase.from("zeitfenster").update({ start: normalized.start, ende: normalized.ende }).eq("wettkampf", normalized.wettkampf).eq("saison", activeSeason));
    } else {
      ({ error: updateError } = await supabase.from("zeitfenster").insert(withSeasonPayload({ wettkampf: normalized.wettkampf, start: normalized.start, ende: normalized.ende }, activeSeason)));
    }

    if (updateError) {
      logError("Zeitfenster konnte nicht gespeichert werden.");
      setHinweis("❌ Fehler beim Speichern");
      setSavingWettkampf(null);
      return;
    }

    setOpenEditorKey(null);
    setSavingWettkampf(null);
    setHinweis(`✅ Zeitfenster WK${normalized.wettkampf} gespeichert.`);
    setGespeichert(normalized.wettkampf);
    await fetchZeitfenster();
    onRefreshStats?.();
    setTimeout(() => {
      setHinweis("");
      setGespeichert(null);
    }, 2500);
  };

  const istOffen = (startStr, endeStr) => {
    if (!startStr || !endeStr) return false;
    const jetzt = new Date();
    const start = new Date(startStr);
    const ende = new Date(endeStr);
    return jetzt >= start && jetzt <= ende;
  };

  const formatDatum = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const zaehleOffeneFenster = () => zeitfenster.filter((z) => istOffen(z.start, z.ende)).length;
  const zaehleGespeicherteFenster = () => zeitfenster.filter((z) => z.start && z.ende).length;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-r from-white via-emerald-50/60 to-cyan-50/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Wettkampffenster</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Zeitfenster</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">Hier werden Start- und Endzeiten für alle 9 Wettkämpfe festgelegt. Änderungen können direkt pro Wettkampf gespeichert werden.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gesamt</p><p className="mt-2 text-2xl font-semibold text-zinc-900">9</p><p className="mt-1 text-sm text-zinc-500">Wettkämpfe</p></div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gespeichert</p><p className="mt-2 text-2xl font-semibold text-zinc-900">{zaehleGespeicherteFenster()}</p><p className="mt-1 text-sm text-zinc-500">Mit Zeitfenster</p></div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktuell offen</p><p className="mt-2 text-2xl font-semibold text-zinc-900">{zaehleOffeneFenster()}</p><p className="mt-1 text-sm text-zinc-500">Freigegebene WK</p></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-zinc-900">Alle Zeitfenster</h3>
          <p className="mt-1 text-sm text-zinc-600">Jeder Wettkampf kann einzeln bearbeitet und gespeichert werden.</p>
        </div>
        {hinweis ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm">{hinweis}</div> : null}
      </div>

      <div className="grid gap-4">
        {zeitfenster.map((z) => {
          const offen = istOffen(z.start, z.ende);
          const gesetzt = Boolean(z.start && z.ende);
          const geschlossen = gesetzt && !offen;
          const startInZukunft = gesetzt && Date.parse(z.start) > Date.now();
          const containerClass = offen ? "border-emerald-200 bg-emerald-50/50 shadow-[0_14px_34px_rgba(16,185,129,0.10)]" : startInZukunft ? "border-amber-200 bg-amber-50/55 shadow-[0_12px_30px_rgba(245,158,11,0.10)]" : geschlossen ? "border-rose-200 bg-rose-50/55 shadow-[0_12px_30px_rgba(244,63,94,0.08)]" : "border-zinc-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-zinc-300 hover:shadow-[0_12px_28px_rgba(16,24,40,0.08)]";
          const statusBadgeClass = offen ? "border-emerald-200 bg-emerald-100 text-emerald-800" : startInZukunft ? "border-amber-200 bg-amber-100 text-amber-800" : geschlossen ? "border-rose-200 bg-rose-100 text-rose-700" : "border-zinc-200 bg-zinc-50 text-zinc-600";
          const detailBadgeClass = gesetzt ? startInZukunft ? "border-amber-200 bg-white text-amber-700" : offen ? "border-emerald-200 bg-white text-emerald-700" : "border-rose-200 bg-white text-rose-700" : "border-zinc-200 bg-white text-zinc-500";

          return (
            <div key={z.wettkampf} className={`rounded-3xl border p-4 transition-all duration-200 sm:p-5 ${containerClass}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm">WK{z.wettkampf}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>{offen ? "offen" : startInZukunft ? "gesetzt" : geschlossen ? "geschlossen" : "ungeplant"}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${detailBadgeClass}`}>{gesetzt ? "Zeitfenster gesetzt" : "Noch nicht gesetzt"}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">{z.start && z.ende ? `Gespeichert: ${formatDatum(z.start)} – ${formatDatum(z.ende)}` : "Bitte Start und Ende für diesen Wettkampf festlegen."}</p>
                  </div>
                </div>

                <div className="grid gap-3 overflow-visible md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] md:items-start">
                  <DateTimeEditor label="Startdatum" value={z.start} editorKey={`${z.id}-start`} openEditorKey={openEditorKey} onToggle={setOpenEditorKey} onApply={(val) => aktualisiereZeitfenster(z.id, "start", val)} />
                  <DateTimeEditor label="Enddatum" value={z.ende} editorKey={`${z.id}-ende`} openEditorKey={openEditorKey} onToggle={setOpenEditorKey} onApply={(val) => aktualisiereZeitfenster(z.id, "ende", val)} />
                  <button type="button" onClick={() => speichereZeitfenster(z)} disabled={savingWettkampf === z.wettkampf} className={`btn-action min-h-[46px] w-full md:w-auto ${gespeichert === z.wettkampf ? "ring-2 ring-emerald-500/30" : ""} ${savingWettkampf === z.wettkampf ? "cursor-wait opacity-70" : ""}`}>{savingWettkampf === z.wettkampf ? "Speichert…" : "Speichern"}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
