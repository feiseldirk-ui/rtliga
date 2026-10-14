import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase/client";
import {
  FEEDBACK_BUCKET,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS,
  FEEDBACK_STATUS_LABELS,
  formatFeedbackForHandoff,
} from "../../../lib/feedback";
import AppChoiceField from "../../../shared/ui/AppChoiceField";

const STATUS_STYLE = {
  neu: "border-sky-200 bg-sky-50 text-sky-700",
  in_pruefung: "border-amber-200 bg-amber-50 text-amber-800",
  vorgesehen: "border-indigo-200 bg-indigo-50 text-indigo-700",
  erledigt: "border-emerald-200 bg-emerald-50 text-emerald-700",
  abgelehnt: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const CATEGORY_LABELS = {
  fehler: "Fehler",
  verbesserung: "Verbesserung",
  hinweis: "Hinweis",
};

const FILTER_OPTIONS = [
  { value: "offen", label: "Offene Meldungen" },
  { value: "neu", label: "Nur neue" },
  { value: "in_pruefung", label: "In Prüfung" },
  { value: "vorgesehen", label: "Vorgesehen" },
  { value: "erledigt", label: "Erledigt" },
  { value: "abgelehnt", label: "Abgelehnt" },
  { value: "alle", label: "Alle Meldungen" },
];

const STATUS_OPTIONS = FEEDBACK_STATUS.map((status) => ({ value: status, label: FEEDBACK_STATUS_LABELS[status] }));
const PRIORITY_OPTIONS = FEEDBACK_PRIORITIES.map((priority) => ({ value: priority, label: FEEDBACK_PRIORITY_LABELS[priority] }));

function formatDate(value) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function FeedbackTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("offen");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("app_feedback")
      .select("id, created_at, updated_at, reporter_user_id, verein_id, category, title, description, area, screenshot_path, page_url, user_agent, app_version, status, priority, admin_note, resolved_at, vereine(vereinsname)")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError("Meldungen konnten nicht geladen werden.");
      setReports([]);
    } else {
      setReports(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadReports, 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  const filteredReports = useMemo(() => reports.filter((report) => {
    if (filter === "alle") return true;
    if (filter === "offen") return !["erledigt", "abgelehnt"].includes(report.status);
    return report.status === filter;
  }), [filter, reports]);

  const selected = useMemo(
    () => reports.find((report) => report.id === selectedId) || null,
    [reports, selectedId],
  );

  const selectReport = (report) => {
    setSelectedId(report.id);
    setDraft({
      status: report.status,
      priority: report.priority,
      admin_note: report.admin_note || "",
    });
    setNotice("");
    setScreenshotUrl("");

    if (!report.screenshot_path) return;
    supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(report.screenshot_path, 600)
      .then(({ data, error: signedUrlError }) => {
        if (signedUrlError) setError("Der Screenshot konnte nicht geöffnet werden.");
        else setScreenshotUrl(data?.signedUrl || "");
      });
  };

  const save = async () => {
    if (!selected || !draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const completed = ["erledigt", "abgelehnt"].includes(draft.status);
    const { data, error: saveError } = await supabase
      .from("app_feedback")
      .update({
        status: draft.status,
        priority: draft.priority,
        admin_note: draft.admin_note.trim() || null,
        resolved_at: completed ? (selected.resolved_at || new Date().toISOString()) : null,
      })
      .eq("id", selected.id)
      .select("id")
      .single();

    if (saveError || !data) {
      setError("Die Bearbeitung konnte nicht gespeichert werden.");
    } else {
      setNotice("Bearbeitung gespeichert.");
      await loadReports();
    }
    setSaving(false);
  };

  const copyHandoff = async () => {
    if (!selected || !draft) return;
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(formatFeedbackForHandoff({ ...selected, ...draft }));
      setNotice("Übergabetext wurde kopiert. Screenshot bei Bedarf separat herunterladen und im Chat beifügen.");
    } catch {
      setError("Der Übergabetext konnte nicht kopiert werden. Bitte Browserberechtigung prüfen.");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(520px,1.5fr)]">
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-zinc-950">Eingegangene Meldungen</h4>
            <p className="mt-1 text-sm text-zinc-500">{reports.length} Meldungen insgesamt</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={loadReports} disabled={loading}>Aktualisieren</button>
        </div>

        <AppChoiceField
          className="mt-4"
          label="Anzeige"
          value={filter}
          options={FILTER_OPTIONS}
          onChange={setFilter}
        />

        {loading && <p className="mt-5 text-sm text-zinc-500">Meldungen werden geladen…</p>}
        {!loading && filteredReports.length === 0 && <p className="mt-5 rounded-2xl bg-white p-4 text-sm text-zinc-500">Für diesen Filter sind keine Meldungen vorhanden.</p>}

        <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {filteredReports.map((report) => {
            const active = report.id === selectedId;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => selectReport(report)}
                className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-zinc-200 bg-white hover:border-indigo-200"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{CATEGORY_LABELS[report.category] || report.category}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[report.status] || STATUS_STYLE.neu}`}>
                    {FEEDBACK_STATUS_LABELS[report.status] || report.status}
                  </span>
                </div>
                <p className="mt-2 font-semibold text-zinc-950">{report.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{report.vereine?.vereinsname || "Verein"} · {formatDate(report.created_at)}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        {!selected || !draft ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-zinc-500">Bitte links eine Meldung auswählen.</div>
        ) : (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{CATEGORY_LABELS[selected.category] || selected.category}</p>
                <h4 className="mt-1 text-xl font-semibold text-zinc-950">{selected.title}</h4>
                <p className="mt-2 text-sm text-zinc-500">{selected.vereine?.vereinsname || "Unbekannter Verein"} · {formatDate(selected.created_at)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[selected.status] || STATUS_STYLE.neu}`}>
                {FEEDBACK_STATUS_LABELS[selected.status] || selected.status}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-3"><dt className="font-semibold text-zinc-500">Bereich</dt><dd className="mt-1 text-zinc-900">{selected.area}</dd></div>
              <div className="rounded-2xl bg-zinc-50 p-3"><dt className="font-semibold text-zinc-500">App-Version</dt><dd className="mt-1 text-zinc-900">{selected.app_version || "nicht angegeben"}</dd></div>
            </dl>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <h5 className="font-semibold text-zinc-950">Beschreibung</h5>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{selected.description}</p>
            </div>

            {selected.screenshot_path && (
              <div className="mt-4 rounded-2xl border border-zinc-200 p-3">
                <h5 className="mb-3 font-semibold text-zinc-950">Screenshot</h5>
                {screenshotUrl ? (
                  <>
                    <a href={screenshotUrl} target="_blank" rel="noreferrer">
                      <img src={screenshotUrl} alt="Screenshot zur Meldung" className="max-h-[460px] w-full rounded-xl bg-zinc-100 object-contain" />
                    </a>
                    <a className="btn btn-secondary mt-3" href={screenshotUrl} target="_blank" rel="noreferrer" download>Screenshot öffnen</a>
                  </>
                ) : <p className="text-sm text-zinc-500">Screenshot wird geladen…</p>}
              </div>
            )}

            <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <summary className="cursor-pointer font-semibold text-zinc-800">Technische Angaben</summary>
              <div className="mt-3 space-y-2 break-words text-xs leading-5 text-zinc-600">
                <p><strong>Seite:</strong> {selected.page_url || "nicht angegeben"}</p>
                <p><strong>Gerät und Browser:</strong> {selected.user_agent || "nicht angegeben"}</p>
                <p><strong>Meldungs-ID:</strong> {selected.id}</p>
              </div>
            </details>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <AppChoiceField
                label="Status"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(status) => setDraft((current) => ({ ...current, status }))}
              />
              <AppChoiceField
                label="Priorität"
                value={draft.priority}
                options={PRIORITY_OPTIONS}
                onChange={(priority) => setDraft((current) => ({ ...current, priority }))}
              />
            </div>

            <label className="mt-4 block text-sm font-semibold text-zinc-800">Adminnotiz oder Antwort an den Verein
              <textarea
                className="input mt-2 min-h-28 resize-y"
                maxLength={4000}
                value={draft.admin_note}
                onChange={(event) => setDraft((current) => ({ ...current, admin_note: event.target.value }))}
                placeholder="Prüfergebnis, Rückfrage oder Begründung eintragen"
              />
            </label>

            {error && <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Speichert…" : "Bearbeitung speichern"}</button>
              <button type="button" className="btn btn-secondary" onClick={copyHandoff}>Für Anpassung vorbereiten</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
