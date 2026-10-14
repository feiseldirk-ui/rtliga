import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../lib/supabase/client";
import {
  createFeedbackStoragePath,
  FEEDBACK_AREA_OPTIONS,
  FEEDBACK_BUCKET,
  FEEDBACK_STATUS_LABELS,
  validateFeedbackDraft,
} from "../../lib/feedback";
import AppDialog from "../ui/AppDialog";

const EMPTY_FORM = {
  category: "fehler",
  area: "Vereinsbereich allgemein",
  title: "",
  description: "",
  screenshot: null,
};

const STATUS_STYLE = {
  neu: "border-sky-200 bg-sky-50 text-sky-700",
  in_pruefung: "border-amber-200 bg-amber-50 text-amber-800",
  vorgesehen: "border-indigo-200 bg-indigo-50 text-indigo-700",
  erledigt: "border-emerald-200 bg-emerald-50 text-emerald-700",
  abgelehnt: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function FeedbackDialog({ open, onClose, verein, area }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const previewUrl = useMemo(
    () => (form.screenshot ? URL.createObjectURL(form.screenshot) : ""),
    [form.screenshot],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const loadReports = useCallback(async () => {
    if (!open) return;
    setLoadingReports(true);
    const { data, error: loadError } = await supabase
      .from("app_feedback")
      .select("id, created_at, category, title, area, status, priority, admin_note")
      .order("created_at", { ascending: false })
      .limit(20);

    if (loadError) {
      setError("Die bisherigen Meldungen konnten nicht geladen werden.");
    } else {
      setReports(data || []);
    }
    setLoadingReports(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setMessage("");
    setForm((current) => ({
      ...current,
      area: area || current.area || "Vereinsbereich allgemein",
    }));
    void loadReports();
  }, [open, area, loadReports]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validateFeedbackDraft(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    let screenshotPath = null;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.user?.id) {
        throw new Error("Sitzung abgelaufen");
      }

      const userId = sessionData.session.user.id;
      const feedbackId = crypto.randomUUID();

      if (form.screenshot) {
        screenshotPath = createFeedbackStoragePath(userId, feedbackId, form.screenshot);
        const { error: uploadError } = await supabase.storage
          .from(FEEDBACK_BUCKET)
          .upload(screenshotPath, form.screenshot, {
            cacheControl: "3600",
            contentType: form.screenshot.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }

      const safePageUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      const { error: insertError } = await supabase.from("app_feedback").insert({
        id: feedbackId,
        reporter_user_id: userId,
        verein_id: verein.id,
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        area: form.area || area || "Vereinsbereich allgemein",
        screenshot_path: screenshotPath,
        page_url: safePageUrl,
        user_agent: navigator.userAgent,
        app_version: import.meta.env.VITE_APP_VERSION || "RTLiga Web",
      });

      if (insertError) {
        if (screenshotPath) {
          await supabase.storage.from(FEEDBACK_BUCKET).remove([screenshotPath]);
        }
        throw insertError;
      }

      setForm({ ...EMPTY_FORM, area: area || "Vereinsbereich allgemein" });
      setMessage("Die Meldung wurde übermittelt. Vielen Dank für den Hinweis.");
      await loadReports();
    } catch {
      setError("Die Meldung konnte nicht gesendet werden. Bitte Verbindung prüfen und erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog open={open} onCancel={onClose} title="Fehler oder Hinweis melden">
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Beschreibe kurz, was passiert ist oder was verbessert werden könnte. Ein Screenshot hilft bei der Prüfung.
      </p>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-zinc-800">
          Art der Meldung
          <select
            className="input mt-2"
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
          >
            <option value="fehler">Fehler</option>
            <option value="verbesserung">Verbesserungsvorschlag</option>
            <option value="hinweis">Allgemeiner Hinweis</option>
          </select>
        </label>

        <label className="block text-sm font-semibold text-zinc-800">
          Betroffener Bereich
          <select
            className="input mt-2"
            value={form.area}
            onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
          >
            {FEEDBACK_AREA_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs font-normal text-zinc-500">
            Der aktuell geöffnete Bereich ist vorausgewählt und kann geändert werden.
          </span>
        </label>

        <label className="block text-sm font-semibold text-zinc-800">
          Kurze Überschrift
          <input
            className="input mt-2"
            value={form.title}
            maxLength={120}
            placeholder="Zum Beispiel: Speichern nicht möglich"
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            required
          />
        </label>

        <label className="block text-sm font-semibold text-zinc-800">
          Beschreibung
          <textarea
            className="input mt-2 min-h-32 resize-y"
            value={form.description}
            maxLength={4000}
            placeholder="Was wurde gemacht, was ist passiert und was wurde erwartet?"
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            required
          />
        </label>

        <label className="block rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-sm font-semibold text-indigo-800">
          Screenshot hinzufügen
          <input
            className="mt-3 block w-full text-sm font-normal text-zinc-700 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-semibold file:text-white"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setForm((current) => ({ ...current, screenshot: event.target.files?.[0] || null }))}
          />
          <span className="mt-2 block text-xs font-normal text-zinc-600">PNG, JPG oder WebP, maximal 8 MB</span>
        </label>

        {previewUrl && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <img src={previewUrl} alt="Vorschau des gewählten Screenshots" className="max-h-56 w-full rounded-xl object-contain" />
            <button
              type="button"
              className="btn btn-secondary mt-3"
              onClick={() => setForm((current) => ({ ...current, screenshot: null }))}
            >
              Screenshot entfernen
            </button>
          </div>
        )}

        {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Meldung wird gesendet…" : "Meldung absenden"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={submitting}>Schließen</button>
        </div>
      </form>

      <div className="mt-7 border-t border-zinc-200 pt-5">
        <h3 className="font-semibold text-zinc-950">Meine letzten Meldungen</h3>
        {loadingReports && <p className="mt-3 text-sm text-zinc-500">Meldungen werden geladen…</p>}
        {!loadingReports && reports.length === 0 && <p className="mt-3 text-sm text-zinc-500">Noch keine Meldungen vorhanden.</p>}
        <div className="mt-3 space-y-3">
          {reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">{report.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(report.created_at)} · {report.area}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[report.status] || STATUS_STYLE.neu}`}>
                  {FEEDBACK_STATUS_LABELS[report.status] || report.status}
                </span>
              </div>
              {report.admin_note && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-zinc-700"><strong>Antwort:</strong> {report.admin_note}</p>}
            </article>
          ))}
        </div>
      </div>
    </AppDialog>
  );
}
