import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { ensureSupabaseSession } from "../../../lib/authReady";
import { logError } from "../../../lib/logger";
import { loadSeasonSettings } from "../../../lib/seasonSettings";

const WK_ANZAHL = 9;

function formatDate(isoString) {
  if (!isoString) return "";
  const [year, month, day] = isoString.split("T")[0].split("-");
  return `${day}.${month}.${year}`;
}

function parseNumber(text, key) {
  const match = String(text || "").match(new RegExp(`${key}=(\\d+)`, "i"));
  return match?.[1] ? Number(match[1]) : 0;
}

function parseStatus(text) {
  const match = String(text || "").match(/Status=(.*)$/i);
  return match?.[1]?.trim() || "";
}

function sanitizeSerieValue(value) {
  const clean = String(value ?? "").replace(/\D/g, "").slice(0, 3);
  if (clean === "") return "";
  return String(Math.min(Number(clean), 100));
}

function calcLL(wk) {
  return Number(wk.s1 || 0) + Number(wk.s2 || 0) + Number(wk.s3 || 0);
}

function calcSL(wk) {
  return Number(wk.s4 || 0) + Number(wk.s5 || 0) + Number(wk.s6 || 0);
}

function calcWKGesamt(wk) {
  return calcLL(wk) + calcSL(wk);
}

function calcTeilnehmerGesamt(ergebnisse = []) {
  return ergebnisse.reduce((sum, wk) => sum + Number(wk.gesamt || 0), 0);
}

function createEmptyWK() {
  return {
    s1: "",
    s2: "",
    s3: "",
    s4: "",
    s5: "",
    s6: "",
    ll: 0,
    sl: 0,
    gesamt: 0,
    status: "",
  };
}

function hydrateWK(entry) {
  if (!entry) return createEmptyWK();

  const structured = {
    s1: entry.s1 != null && Number(entry.s1) > 0 ? String(entry.s1) : "",
    s2: entry.s2 != null && Number(entry.s2) > 0 ? String(entry.s2) : "",
    s3: entry.s3 != null && Number(entry.s3) > 0 ? String(entry.s3) : "",
    s4: entry.s4 != null && Number(entry.s4) > 0 ? String(entry.s4) : "",
    s5: entry.s5 != null && Number(entry.s5) > 0 ? String(entry.s5) : "",
    s6: entry.s6 != null && Number(entry.s6) > 0 ? String(entry.s6) : "",
    ll: Number(entry.ll || 0),
    sl: Number(entry.sl || 0),
    gesamt: Number(entry.gesamt || 0),
    status: entry.status || "",
  };

  const hasStructuredColumns =
    entry.s1 != null ||
    entry.s2 != null ||
    entry.s3 != null ||
    entry.s4 != null ||
    entry.s5 != null ||
    entry.s6 != null ||
    entry.ll != null ||
    entry.sl != null ||
    entry.gesamt != null;

  if (hasStructuredColumns) {
    const hasEinzelserien = [
      structured.s1,
      structured.s2,
      structured.s3,
      structured.s4,
      structured.s5,
      structured.s6,
    ].some((value) => value !== "");

    if (hasEinzelserien) {
      const ll = calcLL(structured);
      const sl = calcSL(structured);
      const gesamt = ll + sl;

      return {
        ...structured,
        ll,
        sl,
        gesamt,
      };
    }

    return structured;
  }

  const legacy = {
    s1: parseNumber(entry.ergebnis, "S1") ? String(parseNumber(entry.ergebnis, "S1")) : "",
    s2: parseNumber(entry.ergebnis, "S2") ? String(parseNumber(entry.ergebnis, "S2")) : "",
    s3: parseNumber(entry.ergebnis, "S3") ? String(parseNumber(entry.ergebnis, "S3")) : "",
    s4: parseNumber(entry.ergebnis, "S4") ? String(parseNumber(entry.ergebnis, "S4")) : "",
    s5: parseNumber(entry.ergebnis, "S5") ? String(parseNumber(entry.ergebnis, "S5")) : "",
    s6: parseNumber(entry.ergebnis, "S6") ? String(parseNumber(entry.ergebnis, "S6")) : "",
    status: parseStatus(entry.ergebnis),
  };

  const llFromSeries = calcLL(legacy);
  const slFromSeries = calcSL(legacy);
  const ll = llFromSeries || parseNumber(entry.ergebnis, "LL");
  const sl = slFromSeries || parseNumber(entry.ergebnis, "SL");
  const gesamt = ll + sl || parseNumber(entry.ergebnis, "Gesamt");

  return {
    ...legacy,
    ll,
    sl,
    gesamt,
  };
}

function serializeErgebnis(wkNummer, wk) {
  return `WK${wkNummer}: S1=${Number(wk.s1 || 0)}, S2=${Number(wk.s2 || 0)}, S3=${Number(
    wk.s3 || 0
  )}, LL=${Number(wk.ll || 0)}, S4=${Number(wk.s4 || 0)}, S5=${Number(wk.s5 || 0)}, S6=${Number(
    wk.s6 || 0
  )}, SL=${Number(wk.sl || 0)}, Gesamt=${Number(wk.gesamt || 0)}, Status=${wk.status || ""}`;
}

export default function VereinErgebnisseEintragen({ onBack, verein, onDirtyChange, onRegisterUnsavedActions }) {
  const [teilnehmer, setTeilnehmer] = useState([]);
  const [zeitfenster, setZeitfenster] = useState([]);
  const [hinweis, setHinweis] = useState("");
  const [saveFeedback, setSaveFeedback] = useState({});
  const [offenIndex, setOffenIndex] = useState(null);
  const [dirtyIndex, setDirtyIndex] = useState(null);
  const [wechselWarnung, setWechselWarnung] = useState(null);
  const [suche, setSuche] = useState("");
  const [savingIndex, setSavingIndex] = useState(null);
  const [activeSeason, setActiveSeason] = useState(() => String(loadSeasonSettings().activeSeason || new Date().getFullYear()));

  const wechselWarnungRef = useRef(null);
  const wkRefs = useRef({});
  const participantRefs = useRef({});

  useEffect(() => {
    const settings = loadSeasonSettings();
    setActiveSeason(String(settings.activeSeason || new Date().getFullYear()));
  }, []);

  useEffect(() => {
    if (!verein?.id) return;
    fetchTeilnehmer();
    fetchZeitfenster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verein?.id, activeSeason]);

  useEffect(() => {
    if (!wechselWarnung) return;

    const timer = window.setTimeout(() => {
      wechselWarnungRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [wechselWarnung]);

  useEffect(() => {
    if (offenIndex === null) return;

    const timer = window.setTimeout(() => {
      const participantRef = participantRefs.current[offenIndex];
      participantRef?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      const firstOpenWkIndex = Array.from({ length: WK_ANZAHL }, (_, i) => i).find(
        (i) => getWettkampfStatus(i).offen
      );

      if (firstOpenWkIndex === undefined) return;

      const targetRef = wkRefs.current[`${offenIndex}-${firstOpenWkIndex}`];
      window.setTimeout(() => {
        targetRef?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 140);
    }, 80);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offenIndex, zeitfenster]);

  useEffect(() => {
    onDirtyChange?.(dirtyIndex !== null);
  }, [dirtyIndex, onDirtyChange]);

  useEffect(() => {
    onRegisterUnsavedActions?.({
      save: async () => {
        if (dirtyIndex === null) return true;
        return saveTeilnehmerErgebnisse(dirtyIndex);
      },
      discard: async () => {
        if (dirtyIndex === null) return true;
        setDirtyIndex(null);
        setWechselWarnung(null);
        setHinweis("");
        setSaveFeedback({});
        await fetchTeilnehmer();
        return true;
      },
    });

    return () => {
      onRegisterUnsavedActions?.({
        save: async () => true,
        discard: async () => true,
      });
      onDirtyChange?.(false);
    };
  }, [dirtyIndex, onRegisterUnsavedActions, onDirtyChange, activeSeason, verein?.id, teilnehmer]);

  const fetchTeilnehmer = async () => {
    await ensureSupabaseSession();

    const { data: teilnehmerData, error: teilnehmerError } = await supabase
      .from("verein_teilnehmer")
      .select("*")
      .eq("verein_id", verein.id)
      .eq("saison", activeSeason)
      .order("name", { ascending: true })
      .order("vorname", { ascending: true });

    const { data: ergebnisseData, error: ergebnisseError } = await supabase
      .from("verein_ergebnisse")
      .select("*")
      .eq("verein", verein.vereinsname)
      .eq("saison", activeSeason);

    if (teilnehmerError) {
      logError("Teilnehmer konnten nicht geladen werden.");
      setHinweis("Teilnehmer konnten nicht geladen werden.");
      return;
    }

    if (ergebnisseError) {
      logError("Ergebnisse konnten nicht geladen werden.");
    }

    const vorbereitet = (teilnehmerData || []).map((t) => {
      const ergebnisse = Array.from({ length: WK_ANZAHL }, (_, i) => {
        const eintrag = (ergebnisseData || []).find(
          (e) =>
            e.vorname === t.vorname &&
            e.nachname === t.name &&
            e.altersklasse === t.altersklasse &&
            Number(e.wettkampf) === i + 1
        );

        return hydrateWK(eintrag);
      });

      return {
        ...t,
        ergebnisse,
        gesamt: calcTeilnehmerGesamt(ergebnisse),
      };
    });

    setTeilnehmer(vorbereitet);
  };

  const fetchZeitfenster = async () => {
    await ensureSupabaseSession();
    const { data, error } = await supabase
      .from("zeitfenster")
      .select("*")
      .eq("saison", activeSeason)
      .order("wettkampf", { ascending: true });

    if (error) {
      logError("Zeitfenster konnten nicht geladen werden.");
      return;
    }

    setZeitfenster(data || []);
  };

  const getWettkampfStatus = (wkIndex) => {
    const z = zeitfenster.find((zf) => Number(zf.wettkampf) === wkIndex + 1);

    if (!z) {
      return { label: "Kein Zeitfenster", tone: "zinc", offen: false, detail: "Kein Datum" };
    }

    const now = new Date();
    const start = z.start ? new Date(z.start) : null;
    const end = z.ende ? new Date(z.ende) : null;

    if (start && now < start) {
      return {
        label: "Noch nicht geöffnet",
        tone: "sky",
        offen: false,
        detail: `${formatDate(z.start)} – ${formatDate(z.ende)}`,
      };
    }

    if (end && now > end) {
      return {
        label: "Geschlossen",
        tone: "rose",
        offen: false,
        detail: `bis ${formatDate(z.ende)}`,
      };
    }

    return {
      label: "Offen",
      tone: "emerald",
      offen: true,
      detail: `${formatDate(z.start)} – ${formatDate(z.ende)}`,
    };
  };

  const toneClasses = (tone) => {
    if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (tone === "sky") return "border-sky-200 bg-sky-50 text-sky-800";
    if (tone === "rose") return "border-rose-200 bg-rose-50 text-rose-800";
    return "border-zinc-200 bg-zinc-50 text-zinc-700";
  };

  const initials = (t) => {
    const a = (t?.vorname || "").trim().slice(0, 1).toUpperCase();
    const b = (t?.name || "").trim().slice(0, 1).toUpperCase();
    return (a + b) || "SV";
  };

  const anyResultForTeilnehmer = (t) => {
    if (!t?.ergebnisse?.length) return false;
    return t.ergebnisse.some((wk) => Number(wk.gesamt || 0) > 0);
  };

  const filteredTeilnehmer = useMemo(() => {
    const q = suche.trim().toLowerCase();

    return teilnehmer
      .map((t, sourceIndex) => ({ ...t, sourceIndex }))
      .filter((t) => {
        if (!q) return true;
        const full = `${t.vorname || ""} ${t.name || ""} ${t.altersklasse || ""}`.toLowerCase();
        return full.includes(q);
      });
  }, [teilnehmer, suche]);

  const offeneWkCount = useMemo(
    () => Array.from({ length: WK_ANZAHL }, (_, i) => i).filter((i) => getWettkampfStatus(i).offen).length,
    [zeitfenster]
  );

  const teilnehmerMitErgebnissenCount = useMemo(
    () => teilnehmer.filter((t) => anyResultForTeilnehmer(t)).length,
    [teilnehmer]
  );

  const toggleErgebnisse = (index) => {
    if (dirtyIndex !== null && dirtyIndex !== index) {
      setWechselWarnung({ zielIndex: index, fromIndex: dirtyIndex });
      return;
    }

    if (dirtyIndex !== null && dirtyIndex === index && index === offenIndex) {
      setWechselWarnung({ zielIndex: null, fromIndex: dirtyIndex });
      return;
    }

    setOffenIndex((prev) => (prev === index ? null : index));
    setHinweis("");
  };

  const handleInputChange = (tidx, wkidx, field, value) => {
    const sanitized = sanitizeSerieValue(value);

    setHinweis("");
    onDirtyChange?.(true);
    setDirtyIndex(tidx);

    setTeilnehmer((prev) => {
      const copy = [...prev];
      const person = { ...copy[tidx] };
      const ergebnisse = [...person.ergebnisse];
      const wk = { ...ergebnisse[wkidx], [field]: sanitized };

      wk.ll = calcLL(wk);
      wk.sl = calcSL(wk);
      wk.gesamt = calcWKGesamt(wk);

      ergebnisse[wkidx] = wk;
      person.ergebnisse = ergebnisse;
      person.gesamt = calcTeilnehmerGesamt(ergebnisse);
      copy[tidx] = person;

      return copy;
    });
  };

  const saveTeilnehmerErgebnisse = async (tidx) => {
    const t = teilnehmer[tidx];
    if (!t) return false;

    setSavingIndex(tidx);
    setSaveFeedback((current) => ({ ...current, [tidx]: { tone: "saving", text: "Speichert…" } }));

    for (let wkidx = 0; wkidx < t.ergebnisse.length; wkidx += 1) {
      const wk = t.ergebnisse[wkidx];

      const { error } = await supabase.rpc("save_verein_ergebnis", {
        p_verein_id: Number(verein.id),
        p_vorname: t.vorname,
        p_nachname: t.name,
        p_altersklasse: t.altersklasse || "",
        p_wettkampf: wkidx + 1,
        p_s1: Number(wk.s1 || 0),
        p_s2: Number(wk.s2 || 0),
        p_s3: Number(wk.s3 || 0),
        p_s4: Number(wk.s4 || 0),
        p_s5: Number(wk.s5 || 0),
        p_s6: Number(wk.s6 || 0),
        p_ll: Number(wk.ll || 0),
        p_sl: Number(wk.sl || 0),
        p_gesamt: Number(wk.gesamt || 0),
        p_status: wk.status || "",
        p_ergebnis: serializeErgebnis(wkidx + 1, wk),
        p_saison: Number(activeSeason),
      });

      if (error) {
        logError(`Ergebnisse konnten nicht gespeichert werden: ${error.message || "unbekannter Fehler"}`);
        setSaveFeedback((current) => ({
          ...current,
          [tidx]: {
            tone: "error",
            text: error.message || "Speichern fehlgeschlagen. Bitte erneut versuchen.",
          },
        }));
        setSavingIndex(null);
        return false;
      }
    }

    setSavingIndex(null);
    setDirtyIndex(null);
    setSaveFeedback((current) => ({ ...current, [tidx]: { tone: "success", text: "Gespeichert" } }));
    window.setTimeout(() => {
      setSaveFeedback((current) => ({ ...current, [tidx]: null }));
    }, 2200);
    return true;
  };

  const handleSave = async (tidx) => {
    await saveTeilnehmerErgebnisse(tidx);
  };

  const handleSaveAndSwitch = async () => {
    if (dirtyIndex === null) {
      setOffenIndex(wechselWarnung?.zielIndex ?? null);
      setWechselWarnung(null);
      return;
    }

    const ok = await saveTeilnehmerErgebnisse(dirtyIndex);
    if (!ok) return;

    setOffenIndex(wechselWarnung?.zielIndex ?? null);
    setWechselWarnung(null);
  };

  const handleDiscardAndSwitch = () => {
    setDirtyIndex(null);
    setOffenIndex(wechselWarnung?.zielIndex ?? null);
    setWechselWarnung(null);
    setHinweis("");
    setSaveFeedback({});
    fetchTeilnehmer();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-zinc-900">Suche & Hinweise</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Ergebnisse können nur während offener Zeitfenster erfasst werden.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {onBack ? (
              <button onClick={onBack} className="btn btn-secondary">
                Zurück
              </button>
            ) : null}

            <div className="text-sm text-zinc-500">
              Verein:{" "}
              <span className="font-semibold text-zinc-800">{verein?.vereinsname || "-"}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-700">
              Teilnehmer suchen
            </label>
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="z. B. Dirk, Feisel, Herren..."
              className="input w-full"
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900">{filteredTeilnehmer.length}</span>{" "}
            Teilnehmer sichtbar
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">Hinweis:</span> Teilnehmerdaten bleiben
          gesperrt, sobald Ergebnisse vorhanden sind.
        </div>

      </div>


      <div className="space-y-4">
        {filteredTeilnehmer.map((t) => {
          const tidx = t.sourceIndex;
          const participantFeedback = saveFeedback[tidx];
          const hasAny = anyResultForTeilnehmer(t);
          const isOpen = offenIndex === tidx;
          const isDirty = dirtyIndex === tidx;

          return (
            <div
              key={t.id}
              ref={(el) => { participantRefs.current[tidx] = el; }}
              className={`scroll-mt-28 overflow-hidden rounded-3xl border bg-white transition-all duration-200 ${
                isOpen
                  ? "border-indigo-200 shadow-[0_14px_34px_rgba(79,70,229,0.10)]"
                  : "border-zinc-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-zinc-300 hover:shadow-[0_12px_28px_rgba(16,24,40,0.08)]"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleErgebnisse(tidx)}
                className="flex w-full flex-col gap-4 px-5 py-5 text-left sm:px-6"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm">
                        {initials(t)}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-zinc-900 sm:text-xl">
                          {t.vorname} {t.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                            {t.altersklasse}
                          </span>

                          {hasAny ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Ergebnis vorhanden
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-500">
                              Noch kein Ergebnis
                            </span>
                          )}

                          {isDirty ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                              Ungespeichert
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end lg:self-center">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        Gesamt
                      </div>
                      <div className="text-base font-extrabold leading-tight text-indigo-900 tabular-nums sm:text-lg">
                        {t.gesamt}
                      </div>
                    </div>

                    <span className="text-sm font-semibold text-indigo-600">
                      {isOpen ? "Schließen" : "Ergebnis erfassen"}
                    </span>

                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-indigo-100 bg-gradient-to-b from-indigo-50/30 to-white px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                  <div className="sticky top-[112px] z-20 mb-4 rounded-3xl border border-zinc-200 bg-white/95 p-3.5 shadow-sm backdrop-blur">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
                          Aktiver Teilnehmer
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-zinc-900">
                          {t.vorname} {t.name}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                            {t.altersklasse}
                          </span>
                          {isDirty ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                              Ungespeicherte Änderungen
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-500">
                              Keine offenen Änderungen
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-right">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                          Teilnehmer-Gesamt
                        </div>
                        <div className="text-xl font-extrabold leading-tight text-indigo-900 tabular-nums">
                          {t.gesamt}
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px]">
                    <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 shadow-sm">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Eingabestruktur
                      </p>
                      <p className="mt-2 text-sm text-zinc-700">
                        Jeder Wettkampf besteht aus
                        <span className="font-semibold text-zinc-900"> 2 Teilblöcken</span> mit
                        jeweils
                        <span className="font-semibold text-zinc-900"> 3 Einzelserien</span>.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-zinc-200 bg-white p-3.5 shadow-sm">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Freigabe
                      </p>
                      <p className="mt-1 text-xl font-semibold text-zinc-900">{offeneWkCount}</p>
                      <p className="mt-1 text-sm text-zinc-500">Wettkämpfe aktuell offen</p>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                    {t.ergebnisse.map((wk, wkidx) => {
                      const z = getWettkampfStatus(wkidx);
                      const disabled = !z.offen;

                      return (
                        <div
                          key={wkidx}
                          ref={(el) => {
                            wkRefs.current[`${tidx}-${wkidx}`] = el;
                          }}
                          className={`scroll-mt-36 rounded-3xl border p-3.5 shadow-sm ${disabled ? "border-zinc-200 bg-zinc-50/80" : "border-zinc-200 bg-white"}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold text-zinc-900">
                                WK{wkidx + 1}
                              </div>
                              <div className="mt-1 text-[13px] font-semibold text-zinc-700">
                                {t.vorname} {t.name}
                              </div>
                              <div
                                className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(
                                  z.tone
                                )}`}
                              >
                                {z.label}
                              </div>
                            </div>

                            <div className="text-right text-xs text-zinc-500">{z.detail || "Kein Datum"}</div>
                          </div>

                          {disabled ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-center">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">LL</div>
                                  <div className="mt-1 text-base font-bold text-zinc-900 tabular-nums">{wk.ll}</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-center">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">SL</div>
                                  <div className="mt-1 text-base font-bold text-zinc-900 tabular-nums">{wk.sl}</div>
                                </div>
                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-center">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Gesamt</div>
                                  <div className="mt-1 text-base font-extrabold text-indigo-900 tabular-nums">{wk.gesamt}</div>
                                </div>
                              </div>
                              <div className="text-xs text-zinc-500">
                                Dieser Wettkampf ist aktuell nicht freigegeben und wird deshalb kompakter dargestellt.
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mb-3 rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex-1 space-y-2">
                                    {wechselWarnung && wechselWarnung.fromIndex === tidx ? (
                                      <div
                                        ref={wechselWarnungRef}
                                        className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
                                      >
                                        <p>Es gibt ungespeicherte Änderungen für diesen Teilnehmer.</p>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-zinc-500">
                                        {isDirty ? "Änderungen in diesem geöffneten Wettkampf noch nicht gespeichert." : "Keine offenen Änderungen in diesem geöffneten Wettkampf."}
                                      </div>
                                    )}
                                    {participantFeedback ? (
                                      <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${participantFeedback?.tone === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : participantFeedback?.tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-indigo-200 bg-indigo-50 text-indigo-700"}`}>
                                        {participantFeedback?.text}
                                      </div>
                                    ) : null}
                                  </div>

                                  <button
                                    className={savingIndex === tidx ? "btn btn-secondary !rounded-2xl !px-5 !py-3" : participantFeedback?.tone === "success" ? "btn !rounded-2xl !bg-emerald-600 !px-5 !py-3 !text-white hover:!bg-emerald-700" : participantFeedback?.tone === "error" ? "btn !rounded-2xl !bg-rose-600 !px-5 !py-3 !text-white hover:!bg-rose-700" : "btn btn-primary !rounded-2xl !px-5 !py-3"}
                                    onClick={() => handleSave(tidx)}
                                    disabled={savingIndex === tidx}
                                  >
                                    {savingIndex === tidx ? "Speichert…" : participantFeedback?.tone === "success" ? "Gespeichert" : "Ergebnisse speichern"}
                                  </button>
                                </div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2">
                            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="mb-3 text-sm font-semibold text-zinc-700">
                                Langsamlauf
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {["s1", "s2", "s3"].map((key, idx) => (
                                  <div key={key}>
                                    <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                                      S{idx + 1}
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={3}
                                      value={wk[key]}
                                      onChange={(e) =>
                                        handleInputChange(tidx, wkidx, key, e.target.value)
                                      }
                                      disabled={disabled}
                                      className={
                                        disabled
                                          ? "h-10 w-full rounded-2xl border border-zinc-200 bg-zinc-100 px-2 text-center text-sm font-semibold text-zinc-400 outline-none"
                                          : "h-10 w-full rounded-2xl border border-zinc-200 bg-white px-2 text-center text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                                      }
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                  <span>LL Gesamt</span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] text-zinc-500">automatisch</span>
                                </div>
                                <div className="mt-1 text-lg font-extrabold leading-tight text-zinc-900 tabular-nums">
                                  {wk.ll}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="mb-3 text-sm font-semibold text-zinc-700">
                                Schnellauf
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {["s4", "s5", "s6"].map((key, idx) => (
                                  <div key={key}>
                                    <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                                      S{idx + 4}
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={3}
                                      value={wk[key]}
                                      onChange={(e) =>
                                        handleInputChange(tidx, wkidx, key, e.target.value)
                                      }
                                      disabled={disabled}
                                      className={
                                        disabled
                                          ? "h-10 w-full rounded-2xl border border-zinc-200 bg-zinc-100 px-2 text-center text-sm font-semibold text-zinc-400 outline-none"
                                          : "h-10 w-full rounded-2xl border border-zinc-200 bg-white px-2 text-center text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                                      }
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                  <span>SL Gesamt</span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] text-zinc-500">automatisch</span>
                                </div>
                                <div className="mt-1 text-lg font-extrabold leading-tight text-zinc-900 tabular-nums">
                                  {wk.sl}
                                </div>
                              </div>
                            </div>
                          </div>

                              <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                                  WK Gesamt
                                </div>
                                <div className="mt-0.5 text-xl font-extrabold leading-tight text-indigo-900 tabular-nums">
                                  {wk.gesamt}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {wechselWarnung ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/25 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-amber-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Ungespeicherte Änderungen</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-900">Teilnehmer wechseln?</h3>
            <p className="mt-2 text-sm text-zinc-700">
              Für den aktuell geöffneten Teilnehmer gibt es noch Änderungen. Möchtest du diese jetzt speichern oder verwerfen?
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="btn btn-secondary" onClick={() => setWechselWarnung(null)}>
                Abbrechen
              </button>
              <button className="btn btn-secondary" onClick={handleDiscardAndSwitch}>
                Änderungen verwerfen
              </button>
              <button className="btn btn-primary" onClick={handleSaveAndSwitch}>
                Änderungen speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filteredTeilnehmer.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">
          Keine Teilnehmer gefunden.
        </div>
      ) : null}
    </div>
  );
}